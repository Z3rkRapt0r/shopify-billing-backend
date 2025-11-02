import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { markBusinessSchema } from '@/lib/validators';

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

    return NextResponse.json({
      users,
      pagination: {
        page,
        limit,
        total,
        pages: Math.ceil(total / limit),
      },
    });

  } catch (error) {
    console.error('Error fetching users:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}