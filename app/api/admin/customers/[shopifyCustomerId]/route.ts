import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { createShopifyClient, extractBillingDataFromMetafields, isBusinessCustomer } from '@/lib/shopify';
import { billingProfileSchema } from '@/lib/validators';

export async function GET(
  request: NextRequest,
  { params }: { params: { shopifyCustomerId: string } }
) {
  try {
    // Autenticazione admin
    const adminPassword = process.env.ADMIN_PASSWORD;
    const authHeader = request.headers.get('authorization');
    
    if (!adminPassword || !authHeader || authHeader !== `Bearer ${adminPassword}`) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { shopifyCustomerId } = params;

    // Recupera utente dal database
    const user = await prisma.user.findUnique({
      where: {
        shopifyCustomerId: shopifyCustomerId,
      },
      include: {
        billingProfile: true,
      },
    });

    if (!user) {
      return NextResponse.json(
        { error: 'Cliente non trovato' },
        { status: 404 }
      );
    }

    // Recupera metafields da Shopify (fonte di verità per dati fatturazione)
    const shopifyClient = createShopifyClient();
    let shopifyMetafields = [];
    let billingProfileFromShopify = null;
    
    try {
      const metafieldsResponse = await shopifyClient.getCustomerMetafields(shopifyCustomerId);
      shopifyMetafields = metafieldsResponse.metafields || [];
      
      // Ricostruisci billing profile DAI METAFIELDS in tempo reale
      const billingData = extractBillingDataFromMetafields(shopifyMetafields);
      const isBusiness = isBusinessCustomer(shopifyMetafields);
      
      if (isBusiness && billingData) {
        // Recupera anche i dati del cliente da Shopify per l'indirizzo
        const customerResponse = await shopifyClient.getCustomer(shopifyCustomerId);
        const primaryAddress = customerResponse.customer?.addresses?.[0] as any;
        
        const billingProfileData = {
          companyName: billingData.ragioneSociale || undefined,
          vatNumber: billingData.partitaIva || undefined,
          taxCode: billingData.codiceFiscale || undefined,
          pec: undefined, // Non nei metafields standard
          sdiCode: billingData.codiceSdi || undefined,
          addressLine1: primaryAddress?.address1 || undefined,
          addressLine2: primaryAddress?.address2 || undefined,
          city: primaryAddress?.city || undefined,
          province: primaryAddress?.province || undefined,
          postalCode: primaryAddress?.zip || undefined,
          countryCode: primaryAddress?.country_code || user.countryCode || 'IT',
          isBusiness: true,
        };

        // Validazione con Zod
        const validationResult = billingProfileSchema.safeParse(billingProfileData);
        
        if (validationResult.success) {
          // 🔄 AGGIORNA DATABASE con dati Shopify aggiornati
          const updatedProfile = await prisma.billingProfile.upsert({
            where: {
              userId: user.id,
            },
            update: validationResult.data,
            create: {
              userId: user.id,
              ...validationResult.data,
            },
          });
          
          billingProfileFromShopify = {
            ...updatedProfile,
            source: 'shopify_realtime', // Flag per indicare che è aggiornato
          };
          
          console.log(`✅ Billing profile aggiornato in tempo reale e salvato in DB per ${user.email}`);
        } else {
          console.error(`❌ Validazione billing profile fallita per ${user.email}:`, validationResult.error.errors);
          // Se validazione fallisce, usa quello del DB
        }
      } else {
        console.log(`ℹ️  Cliente ${user.email} non è Business (metafields mancanti o incompleti)`);
        
        // Se non è più Business ma ha un billing profile nel DB, rimuovilo
        if (user.billingProfile?.isBusiness) {
          await prisma.billingProfile.delete({
            where: {
              userId: user.id,
            },
          });
          console.log(`🗑️  Billing profile rimosso dal DB per ${user.email} (non più Business)`);
        }
      }
    } catch (error) {
      console.error('Error fetching Shopify metafields:', error);
      // Se fallisce, usiamo il billing profile dal DB
    }

    return NextResponse.json({
      success: true,
      customer: {
        id: user.id,
        shopifyCustomerId: user.shopifyCustomerId,
        email: user.email,
        firstName: user.firstName,
        lastName: user.lastName,
        countryCode: user.countryCode,
        createdAt: user.createdAt,
        // IMPORTANTE: Usa billing profile da Shopify se disponibile, altrimenti dal DB
        billingProfile: billingProfileFromShopify || user.billingProfile,
        billingProfileFromDb: user.billingProfile, // Mantieni anche quello del DB per confronto
        shopifyMetafields: shopifyMetafields.map((m: any) => ({
          id: m.id?.toString() || '',
          namespace: m.namespace || '',
          key: m.key || '',
          value: m.value || '',
          type: m.type || 'string',
        })),
      },
    });

  } catch (error) {
    console.error('Error fetching customer details:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

