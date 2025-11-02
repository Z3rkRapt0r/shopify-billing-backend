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
    const { limit = 50, since_id } = body;

    const shopifyClient = createShopifyClient();
    let syncedCount = 0; // Clienti Business sincronizzati
    let processedCount = 0; // Clienti totali processati
    let skippedCount = 0; // Clienti privati saltati
    let lastCustomerId = since_id;

    // Funzione helper per delay (evita 429)
    const delay = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

    // ⚠️ IMPORTANTE: Fare UNA SOLA chiamata a Shopify per batch
    // Il frontend gestisce il loop per tutti i clienti
    console.log(`🔍 Richiesta Shopify: limit=${limit}, since_id=${lastCustomerId || 'none'}`);
    
    const response = await shopifyClient.getCustomers({
      limit: limit, // Richiedi il numero esatto di clienti
      since_id: lastCustomerId,
    });

    const customers = response.customers || [];
    
    console.log(`📦 Ricevuti ${customers.length} clienti da Shopify (limit: ${limit})`);
    
    if (customers.length > 0) {
      const firstId = customers[0].id;
      const lastId = customers[customers.length - 1].id;
      console.log(`   Range ID: ${firstId} → ${lastId}`);
    }

    // Processa TUTTI i clienti ricevuti da questo batch
    for (const customer of customers) {
      try {
        // Delay di 300ms tra le chiamate per evitare 429 (max 3 richieste/secondo)
        await delay(300);
        
      // Recupera metafields del cliente
      const metafieldsResponse = await shopifyClient.getCustomerMetafields(customer.id.toString());
      const metafields = metafieldsResponse.metafields || [];
      
      // Estrai dati di fatturazione dai metafields
      const billingData = extractBillingDataFromMetafields(metafields);
      let isBusiness = isBusinessCustomer(metafields);
      
      // 🔍 FALLBACK: Se non ha metafields Business, controlla il campo "company" standard
      const primaryAddress = customer.addresses?.[0] as any;
      const hasCompany = primaryAddress?.company && primaryAddress.company.trim().length > 0;
      
      if (!isBusiness && hasCompany) {
        console.log(`🏢 Cliente con Company field: ${customer.email} → "${primaryAddress.company}"`);
        isBusiness = true;
      }
      
      // IMPORTANTE: Sincronizza SOLO i clienti Business
      if (!isBusiness) {
        console.log(`⏭️  Skipping private customer: ${customer.email} (no business indicators)`);
        skippedCount++;
        processedCount++;
        lastCustomerId = customer.id.toString();
        continue;
      }
      
      console.log(`✅ Identificato Business customer: ${customer.email} (${hasCompany ? 'company field' : 'metafields'})`);
      
      // Se non ha billingData da metafields ma ha company, usa quello
      const companyName = billingData?.ragioneSociale || primaryAddress?.company || undefined;

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
    // Se Shopify ha restituito meno clienti del limite richiesto,
    // significa che siamo arrivati alla fine
    const hasMore = customers.length === limit;

    console.log(`✅ Batch completato: processati=${processedCount}, synced=${syncedCount}, skipped=${skippedCount}`);
    console.log(`   hasMore=${hasMore} (ricevuti ${customers.length} su limit ${limit})`);
    console.log(`   lastCustomerId=${lastCustomerId}`);
    
    return NextResponse.json({
      success: true,
      syncedCount, // Clienti Business sincronizzati
      processedCount, // Totale clienti processati
      skippedCount, // Clienti privati saltati
      lastCustomerId,
      hasMore,
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