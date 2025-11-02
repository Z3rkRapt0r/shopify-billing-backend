import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { markBusinessSchema, billingProfileSchema } from '@/lib/validators';
import { createShopifyClient, extractBillingDataFromMetafields, isBusinessCustomer } from '@/lib/shopify';

export async function POST(request: NextRequest) {
  try {
    // Verifica autenticazione admin
    const adminPassword = process.env.ADMIN_PASSWORD;
    const authHeader = request.headers.get('authorization');
    
    if (!adminPassword || !authHeader || authHeader !== `Bearer ${adminPassword}`) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json();
    const validatedData = markBusinessSchema.parse(body);

    // Trova l'utente
    const user = await prisma.user.findUnique({
      where: {
        shopifyCustomerId: validatedData.shopifyCustomerId,
      },
      include: {
        billingProfile: true,
      },
    });

    if (!user) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 });
    }

    // Aggiorna o crea il billing profile
    const billingProfile = await prisma.billingProfile.upsert({
      where: {
        userId: user.id,
      },
      update: {
        isBusiness: validatedData.isBusiness,
        vatNumber: validatedData.vatNumber,
        taxCode: validatedData.taxCode,
        pec: validatedData.pec,
        sdiCode: validatedData.sdiCode,
        updatedAt: new Date(),
      },
      create: {
        userId: user.id,
        isBusiness: validatedData.isBusiness,
        vatNumber: validatedData.vatNumber,
        taxCode: validatedData.taxCode,
        pec: validatedData.pec,
        sdiCode: validatedData.sdiCode,
      },
    });

    // Se il cliente è ora business con P.IVA italiana, aggiorna gli ordini pendenti
    if (validatedData.isBusiness && validatedData.vatNumber && user.countryCode === 'IT') {
      await prisma.orderSnapshot.updateMany({
        where: {
          userId: user.id,
          invoiceStatus: 'PENDING',
        },
        data: {
          hasVatProfile: true,
        },
      });

      // Aggiungi gli ordini aggiornati alla coda per l'emissione fatture
      const pendingOrders = await prisma.orderSnapshot.findMany({
        where: {
          userId: user.id,
          invoiceStatus: 'PENDING',
          hasVatProfile: true,
        },
      });

      for (const order of pendingOrders) {
        await prisma.queueJob.create({
          data: {
            type: 'invoice',
            payload: {
              shopifyOrderId: order.shopifyOrderId,
            },
            status: 'PENDING',
            scheduledAt: new Date(),
          },
        });
      }
    }

    console.log(`User ${validatedData.shopifyCustomerId} marked as business: ${validatedData.isBusiness}`);
    return NextResponse.json({
      success: true,
      billingProfile,
    });

  } catch (error) {
    console.error('Error marking user as business:', error);
    
    if (error instanceof Error && error.message.includes('Invalid')) {
      return NextResponse.json(
        { error: error.message },
        { status: 400 }
      );
    }

    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

// GET - Ottieni lista clienti con stato business
export async function GET(request: NextRequest) {
  try {
    // Verifica autenticazione admin
    const adminPassword = process.env.ADMIN_PASSWORD;
    const authHeader = request.headers.get('authorization');
    
    if (!adminPassword || !authHeader || authHeader !== `Bearer ${adminPassword}`) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const page = parseInt(searchParams.get('page') || '1');
    const limit = parseInt(searchParams.get('limit') || '20');
    const search = searchParams.get('search') || '';
    const isBusiness = searchParams.get('isBusiness');

    const skip = (page - 1) * limit;

    // Costruisci filtri
    const where: any = {};
    
    if (search) {
      where.OR = [
        { email: { contains: search, mode: 'insensitive' } },
        { firstName: { contains: search, mode: 'insensitive' } },
        { lastName: { contains: search, mode: 'insensitive' } },
      ];
    }

    if (isBusiness !== null && isBusiness !== undefined) {
      where.billingProfile = {
        isBusiness: isBusiness === 'true',
      };
    }

    const [users, total] = await Promise.all([
      prisma.user.findMany({
        where,
        include: {
          billingProfile: true,
          orders: {
            take: 1,
            orderBy: { createdAt: 'desc' },
          },
        },
        orderBy: { createdAt: 'desc' },
        skip,
        take: limit,
      }),
      prisma.user.count({ where }),
    ]);

    // 🔄 AUTO-SYNC: Aggiorna billing profile da Shopify per i clienti visibili
    const autoSync = searchParams.get('autoSync') !== 'false'; // Default: true
    
    if (autoSync && users.length > 0) {
      console.log(`🔄 Auto-sync billing profiles per ${users.length} clienti...`);
      const shopifyClient = createShopifyClient();
      
      // Aggiorna ogni cliente in parallelo (con rate limiting)
      for (const user of users) {
        try {
          // Delay di 500ms tra chiamate per rispettare rate limit Shopify
          await new Promise(resolve => setTimeout(resolve, 500));
          
          // Recupera metafields da Shopify
          const metafieldsResponse = await shopifyClient.getCustomerMetafields(user.shopifyCustomerId);
          const metafields = metafieldsResponse.metafields || [];
          
          // Verifica se è Business
          const billingData = extractBillingDataFromMetafields(metafields);
          const isBusiness = isBusinessCustomer(metafields);
          
          if (isBusiness && billingData) {
            // Recupera indirizzo del cliente
            const customerResponse = await shopifyClient.getCustomer(user.shopifyCustomerId);
            const primaryAddress = customerResponse.customer?.addresses?.[0] as any;
            
            const billingProfileData = {
              companyName: billingData.ragioneSociale || undefined,
              vatNumber: billingData.partitaIva || undefined,
              taxCode: billingData.codiceFiscale || undefined,
              pec: undefined,
              sdiCode: billingData.codiceSdi || undefined,
              addressLine1: primaryAddress?.address1 || undefined,
              addressLine2: primaryAddress?.address2 || undefined,
              city: primaryAddress?.city || undefined,
              province: primaryAddress?.province || undefined,
              postalCode: primaryAddress?.zip || undefined,
              countryCode: primaryAddress?.country_code || user.countryCode || 'IT',
              isBusiness: true,
            };

            const validationResult = billingProfileSchema.safeParse(billingProfileData);
            
            if (validationResult.success) {
              // Aggiorna DB
              await prisma.billingProfile.upsert({
                where: { userId: user.id },
                update: validationResult.data,
                create: {
                  userId: user.id,
                  ...validationResult.data,
                },
              });
              
              // Aggiorna anche l'oggetto user in memoria per la risposta
              const updatedData = validationResult.data;
              user.billingProfile = {
                id: user.billingProfile?.id || '',
                userId: user.id,
                companyName: updatedData.companyName ?? null,
                vatNumber: updatedData.vatNumber ?? null,
                taxCode: updatedData.taxCode ?? null,
                pec: updatedData.pec ?? null,
                sdiCode: updatedData.sdiCode ?? null,
                addressLine1: updatedData.addressLine1 ?? null,
                addressLine2: updatedData.addressLine2 ?? null,
                city: updatedData.city ?? null,
                province: updatedData.province ?? null,
                postalCode: updatedData.postalCode ?? null,
                countryCode: updatedData.countryCode ?? null,
                isBusiness: updatedData.isBusiness,
                createdAt: user.billingProfile?.createdAt || new Date(),
                updatedAt: new Date(),
              };
              
              console.log(`✅ Auto-sync: ${user.email} aggiornato`);
            }
          } else if (user.billingProfile?.isBusiness) {
            // Non è più Business, rimuovi billing profile
            await prisma.billingProfile.delete({ where: { userId: user.id } });
            user.billingProfile = null;
            console.log(`🗑️  Auto-sync: ${user.email} non più Business, profilo rimosso`);
          }
        } catch (error) {
          console.error(`⚠️  Auto-sync fallito per ${user.email}:`, error instanceof Error ? error.message : 'Unknown error');
          // Continua con gli altri clienti
        }
      }
      
      console.log(`✅ Auto-sync completato per ${users.length} clienti`);
    }

    return NextResponse.json({
      users,
      pagination: {
        page,
        limit,
        total,
        pages: Math.ceil(total / limit),
      },
      autoSyncEnabled: autoSync,
    });

  } catch (error) {
    console.error('Error fetching users:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}