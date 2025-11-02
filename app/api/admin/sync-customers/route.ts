import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { createShopifyClient, extractBillingDataFromMetafields, isBusinessCustomer } from '@/lib/shopify';
import { billingProfileSchema } from '@/lib/validators';

// POST - Sincronizza clienti da Shopify
export async function POST(request: NextRequest) {
  try {
    // Verifica autenticazione admin (semplice per ora)
    const adminPassword = process.env.ADMIN_PASSWORD;
    const authHeader = request.headers.get('authorization');
    
    if (!adminPassword || !authHeader || authHeader !== `Bearer ${adminPassword}`) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json();
    const { limit = 50, page_info } = body;

    const shopifyClient = createShopifyClient();
    let syncedCount = 0; // Clienti Business sincronizzati
    let processedCount = 0; // Clienti totali processati
    let skippedCount = 0; // Clienti privati saltati
    let lastCustomerId: string | undefined = undefined;
    const processedIds = new Set<string>(); // Track IDs già processati

    // Funzione helper per delay (evita 429)
    const delay = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));
    
    // Retry con backoff esponenziale per 429
    const retryWithBackoff = async <T>(fn: () => Promise<T>, maxRetries = 3): Promise<T> => {
      for (let i = 0; i < maxRetries; i++) {
        try {
          return await fn();
        } catch (error: any) {
          if (error.message?.includes('429') && i < maxRetries - 1) {
            const waitTime = Math.pow(2, i) * 1000; // 1s, 2s, 4s
            console.log(`⏳ 429 Rate limit, retry ${i + 1}/${maxRetries} dopo ${waitTime}ms...`);
            await delay(waitTime);
          } else {
            throw error;
          }
        }
      }
      throw new Error('Max retries reached');
    };

    // ⚠️ IMPORTANTE: Fare UNA SOLA chiamata a Shopify per batch
    // Il frontend gestisce il loop per tutti i clienti
    console.log(`\n========== NUOVO BATCH ==========`);
    console.log(`🔍 Richiesta Shopify:`);
    console.log(`   limit: ${limit}`);
    console.log(`   page_info ricevuto: ${page_info ? page_info : 'NONE (prima pagina)'}`);
    
    const response = await shopifyClient.getCustomers({
      limit: limit,
      page_info: page_info,
    });

    const customers = response.customers || [];
    const nextPageInfo = response._pageInfo;
    
    console.log(`\n📦 RISPOSTA Shopify:`);
    console.log(`   Clienti ricevuti: ${customers.length}`);
    console.log(`   nextPageInfo presente: ${nextPageInfo ? 'SÌ' : 'NO'}`);
    if (nextPageInfo) {
      console.log(`   nextPageInfo value: ${nextPageInfo}`);
    }
    
    if (customers.length > 0) {
      const firstId = customers[0].id;
      const lastId = customers[customers.length - 1].id;
      console.log(`   Range ID: ${firstId} → ${lastId}`);
      
      // 🔍 IMPORTANTE: Confronta page_info per vedere se è cambiato
      if (page_info && nextPageInfo) {
        const isSame = page_info === nextPageInfo;
        console.log(`   page_info è cambiato: ${isSame ? '❌ NO (LOOP!)' : '✅ SÌ'}`);
        if (isSame) {
          console.error(`🚨 PROBLEMA CRITICO: Shopify restituisce lo STESSO page_info!`);
          console.error(`   Questo causerà un loop infinito!`);
        }
      }
      
      // 🔍 Verifica duplicati nel batch
      const customerIds = customers.map((c: any) => c.id.toString());
      const uniqueIds = new Set(customerIds);
      if (customerIds.length !== uniqueIds.size) {
        console.warn(`⚠️  ATTENZIONE: Clienti duplicati nel batch! ${customerIds.length} totali, ${uniqueIds.size} unici`);
      }
    }
    console.log(`=================================\n`);

    // Processa TUTTI i clienti ricevuti da questo batch
    for (const customer of customers) {
      try {
        const customerId = customer.id.toString();
        
        // 🔍 IMPORTANTE: Verifica duplicati tra batch
        if (processedIds.has(customerId)) {
          console.warn(`⚠️  Cliente duplicato trovato: ${customerId} - SKIP`);
          processedCount++;
          continue;
        }
        processedIds.add(customerId);
        
        // ⏱️  Delay di 600ms tra le chiamate (rispetta 2 req/sec di Shopify)
        await delay(600);
        
      // Recupera metafields del cliente con retry automatico per 429
      const metafieldsResponse = await retryWithBackoff(() => 
        shopifyClient.getCustomerMetafields(customerId)
      );
      const metafields = metafieldsResponse.metafields || [];
      
      // Estrai dati di fatturazione dai metafields
      const billingData = extractBillingDataFromMetafields(metafields);
      const isBusiness = isBusinessCustomer(metafields);
      
      // ⚠️ IMPORTANTE: Sincronizza SOLO clienti con metafields Business
      // NON usare il campo "company" standard come criterio
      if (!isBusiness) {
        console.log(`⏭️  Skipping customer: ${customer.email} (no business metafields)`);
        skippedCount++;
        processedCount++;
        lastCustomerId = customer.id.toString();
        continue;
      }
      
      if (!billingData) {
        console.log(`⚠️  Business customer without billing data: ${customer.email}`);
        skippedCount++;
        processedCount++;
        lastCustomerId = customer.id.toString();
        continue;
      }
      
      console.log(`✅ Business customer: ${customer.email} (${billingData.ragioneSociale || billingData.partitaIva})`);
      
      const primaryAddress = customer.addresses?.[0] as any;
      const companyName = billingData.ragioneSociale || undefined;

        // Cliente Business - sincronizza
        const user = await prisma.user.upsert({
          where: {
            shopifyCustomerId: customer.id.toString(),
          },
          update: {
            email: customer.email,
            firstName: customer.first_name,
            lastName: customer.last_name,
            countryCode: customer.addresses?.[0]?.country_code,
          },
          create: {
            shopifyCustomerId: customer.id.toString(),
            email: customer.email,
            firstName: customer.first_name,
            lastName: customer.last_name,
            countryCode: customer.addresses?.[0]?.country_code,
          },
        });
        
        // Crea billingProfile con dati disponibili (metafields o company field)
        const billingProfileData = {
          companyName: companyName,
          vatNumber: billingData?.partitaIva || undefined,
          taxCode: billingData?.codiceFiscale || undefined,
          sdiCode: billingData?.codiceSdi || undefined,
          addressLine1: primaryAddress?.address1 || undefined,
          addressLine2: primaryAddress?.address2 || undefined,
          city: primaryAddress?.city || undefined,
          province: primaryAddress?.province || undefined,
          postalCode: primaryAddress?.zip || undefined,
          countryCode: primaryAddress?.country_code || 'IT',
          isBusiness: true,
        };

        const validatedData = billingProfileSchema.parse(billingProfileData);

        await prisma.billingProfile.upsert({
          where: {
            userId: user.id,
          },
          update: validatedData,
          create: {
            userId: user.id,
            ...validatedData,
          },
        });
        
        console.log(`✅ Synced business customer: ${customer.email} (${companyName || billingData?.partitaIva || 'company field'})`);
        syncedCount++;
        processedCount++;
        lastCustomerId = customer.id.toString();
      } catch (error) {
        console.error(`Error syncing customer ${customer.id}:`, error);
        processedCount++;
        lastCustomerId = customer.id.toString();
      }
    }

    // ✅ Determina se ci sono altri clienti:
    // Se Shopify ha restituito page_info, ci sono altri clienti
    const hasMore = !!nextPageInfo;

    const duplicatesFound = processedIds.size < processedCount;
    
    console.log(`✅ Batch completato: processati=${processedCount}, synced=${syncedCount}, skipped=${skippedCount}`);
    console.log(`   IDs unici nel batch: ${processedIds.size}`);
    console.log(`   hasMore=${hasMore} (nextPageInfo ${nextPageInfo ? 'presente' : 'assente'})`);
    if (duplicatesFound) {
      console.warn(`   ⚠️  Duplicati trovati: ${processedCount - processedIds.size} clienti ripetuti`);
    }
    if (lastCustomerId) {
      console.log(`   lastCustomerId=${lastCustomerId}`);
    }
    
    return NextResponse.json({
      success: true,
      syncedCount, // Clienti Business sincronizzati
      processedCount, // Totale clienti processati
      skippedCount, // Clienti privati saltati
      pageInfo: nextPageInfo, // Page info per il prossimo batch
      lastCustomerId, // Manteniamo per compatibilità
      hasMore,
      duplicatesInBatch: duplicatesFound,
    });

  } catch (error) {
    console.error('Error syncing customers:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

// GET - Ottieni stato sincronizzazione
export async function GET(request: NextRequest) {
  try {
    // Verifica autenticazione admin
    const adminPassword = process.env.ADMIN_PASSWORD;
    const authHeader = request.headers.get('authorization');
    
    if (!adminPassword || !authHeader || authHeader !== `Bearer ${adminPassword}`) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const totalUsers = await prisma.user.count();
    const usersWithBillingProfile = await prisma.billingProfile.count();
    const italianUsers = await prisma.user.count({
      where: { countryCode: 'IT' },
    });
    const businessUsers = await prisma.billingProfile.count({
      where: { isBusiness: true },
    });

    return NextResponse.json({
      totalUsers,
      usersWithBillingProfile,
      italianUsers,
      businessUsers,
    });

  } catch (error) {
    console.error('Error getting sync status:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}