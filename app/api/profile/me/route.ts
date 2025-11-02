import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { extractCustomerIdFromToken } from '@/lib/shopify';
import { billingProfileSchema } from '@/lib/validators';

// GET - Ottieni profilo fatturazione dell'utente
export async function GET(request: NextRequest) {
  try {
    // Estrai il token dall'header Authorization
    const authHeader = request.headers.get('authorization');
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const token = authHeader.substring(7);
    const shopifyCustomerId = extractCustomerIdFromToken(token);

    if (!shopifyCustomerId) {
      return NextResponse.json({ error: 'Invalid token' }, { status: 401 });
    }

    // Trova l'utente nel database
    const user = await prisma.user.findUnique({
      where: { shopifyCustomerId },
      include: { billingProfile: true },
    });

    if (!user) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 });
    }

    return NextResponse.json({
      user: {
        id: user.id,
        email: user.email,
        firstName: user.firstName,
        lastName: user.lastName,
        countryCode: user.countryCode,
      },
      billingProfile: user.billingProfile,
    });

  } catch (error) {
    console.error('Error fetching billing profile:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

// POST - Aggiorna profilo fatturazione dell'utente
export async function POST(request: NextRequest) {
  try {
    // Estrai il token dall'header Authorization
    const authHeader = request.headers.get('authorization');
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const token = authHeader.substring(7);
    const shopifyCustomerId = extractCustomerIdFromToken(token);

    if (!shopifyCustomerId) {
      return NextResponse.json({ error: 'Invalid token' }, { status: 401 });
    }

    // Trova l'utente nel database
    const user = await prisma.user.findUnique({
      where: { shopifyCustomerId },
    });

    if (!user) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 });
    }

    // Parse e valida i dati del profilo
    const body = await request.json();
    const validatedData = billingProfileSchema.parse(body);

    // Se viene fornita una P.IVA, imposta automaticamente isBusiness a true
    if (validatedData.vatNumber) {
      validatedData.isBusiness = true;
    }

    // Upsert del billing profile
    const billingProfile = await prisma.billingProfile.upsert({
      where: {
        userId: user.id,
      },
      update: {
        ...validatedData,
        updatedAt: new Date(),
      },
      create: {
        userId: user.id,
        ...validatedData,
      },
    });

    // Aggiorna gli ordini pendenti per riflettere il nuovo stato del profilo
    if (validatedData.isBusiness && validatedData.vatNumber && validatedData.countryCode === 'IT') {
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

    console.log(`Billing profile updated for user ${shopifyCustomerId}`);
    return NextResponse.json({
      success: true,
      billingProfile,
    });

  } catch (error) {
    console.error('Error updating billing profile:', error);
    
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