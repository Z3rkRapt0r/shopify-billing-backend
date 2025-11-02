import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { verifyShopifyWebhook, parseCustomerWebhook } from '@/lib/shopify';
import { billingProfileSchema } from '@/lib/validators';

export async function POST(request: NextRequest) {
  try {
    const body = await request.text();
    const shopifyHmac = request.headers.get('x-shopify-hmac-sha256');

    // Verifica HMAC
    if (!shopifyHmac || !verifyShopifyWebhook(body, shopifyHmac)) {
      console.error('Webhook HMAC verification failed');
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Parse webhook data
    const webhookData = parseCustomerWebhook(JSON.parse(body));
    
    // Upsert utente nel nostro database
    const user = await prisma.user.upsert({
      where: {
        shopifyCustomerId: webhookData.id,
      },
      update: {
        email: webhookData.email,
        firstName: webhookData.first_name,
        lastName: webhookData.last_name,
        countryCode: webhookData.addresses?.[0]?.country_code,
      },
      create: {
        shopifyCustomerId: webhookData.id,
        email: webhookData.email,
        firstName: webhookData.first_name,
        lastName: webhookData.last_name,
        countryCode: webhookData.addresses?.[0]?.country_code,
      },
    });

    // Se l'utente ha un indirizzo italiano, crea/aggiorna il billing profile
    const primaryAddress = webhookData.addresses?.[0];
    if (primaryAddress && primaryAddress.country_code === 'IT') {
      const billingProfileData = {
        companyName: primaryAddress.company || undefined,
        addressLine1: primaryAddress.address1,
        addressLine2: primaryAddress.address2,
        city: primaryAddress.city,
        province: primaryAddress.province,
        postalCode: primaryAddress.zip,
        countryCode: primaryAddress.country_code,
        isBusiness: !!primaryAddress.company,
      };

      // Validazione con Zod
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
    } else if (primaryAddress && primaryAddress.country_code !== 'IT') {
      // Se l'indirizzo non è italiano, assicuriamoci che il billing profile sia aggiornato
      const existingProfile = await prisma.billingProfile.findUnique({
        where: { userId: user.id },
      });

      if (existingProfile) {
        await prisma.billingProfile.update({
          where: { userId: user.id },
          data: {
            addressLine1: primaryAddress.address1,
            addressLine2: primaryAddress.address2,
            city: primaryAddress.city,
            province: primaryAddress.province,
            postalCode: primaryAddress.zip,
            countryCode: primaryAddress.country_code,
          },
        });
      }
    }

    console.log(`Customer ${webhookData.id} updated successfully`);
    return NextResponse.json({ success: true });

  } catch (error) {
    console.error('Error processing customer update webhook:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}