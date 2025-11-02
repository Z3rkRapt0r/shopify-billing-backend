import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { createOpenAPIClient, buildCreditNoteData } from '@/lib/openapiSdi';
import { issueCreditNoteSchema } from '@/lib/validators';

export async function POST(request: NextRequest) {
  try {
    // Verifica autenticazione admin
    const adminPassword = process.env.ADMIN_PASSWORD;
    const authHeader = request.headers.get('authorization');
    
    if (!adminPassword || !authHeader || authHeader !== `Bearer ${adminPassword}`) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json();
    const { shopifyOrderId, reason } = issueCreditNoteSchema.parse(body);

    // Trova l'ordine nel database
    const order = await prisma.orderSnapshot.findUnique({
      where: { shopifyOrderId },
      include: {
        user: {
          include: {
            billingProfile: true,
          },
        },
      },
    });

    if (!order) {
      return NextResponse.json({ error: 'Order not found' }, { status: 404 });
    }

    // Verifica che la fattura sia stata emessa
    if (order.invoiceStatus !== 'ISSUED') {
      return NextResponse.json({ error: 'Invoice not issued for this order' }, { status: 400 });
    }

    // Se è un cliente estero, crea nota di credito senza inviare a SDI
    if (order.user.countryCode && order.user.countryCode !== 'IT') {
      const creditNote = await prisma.creditNote.create({
        data: {
          orderId: shopifyOrderId,
          reason,
          totalAmount: order.totalPrice,
          status: 'FOREIGN',
        },
      });

      return NextResponse.json({
        success: true,
        message: 'Foreign customer - credit note created locally',
        creditNote,
      });
    }

    // Verifica che il cliente abbia un profilo fatturazione valido
    if (!order.hasVatProfile || !order.user.billingProfile) {
      return NextResponse.json({ error: 'Customer missing valid billing profile' }, { status: 400 });
    }

    // Costruisci i dati per la nota di credito
    const creditNoteData = await buildCreditNoteData(shopifyOrderId, reason);
    if (!creditNoteData) {
      return NextResponse.json({ error: 'Failed to build credit note data' }, { status: 500 });
    }

    // Emetti la nota di credito tramite OpenAPI SDI
    const openAPIClient = createOpenAPIClient();
    const creditNoteResult = await openAPIClient.issueCreditNote(creditNoteData);

    // Crea la nota di credito nel database
    const creditNote = await prisma.creditNote.create({
      data: {
        orderId: shopifyOrderId,
        reason,
        totalAmount: order.totalPrice,
        sdiCreditId: creditNoteResult.id,
        status: 'ISSUED',
      },
    });

    console.log(`Credit note issued for order ${shopifyOrderId}: ${creditNoteResult.id}`);
    return NextResponse.json({
      success: true,
      creditNote,
      sdiCreditId: creditNoteResult.id,
      status: 'ISSUED',
    });

  } catch (error) {
    console.error('Error issuing credit note:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

// GET - Ottieni lista note di credito
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
    const orderId = searchParams.get('orderId');
    const status = searchParams.get('status');

    const skip = (page - 1) * limit;

    // Costruisci filtri
    const where: any = {};

    if (orderId) {
      where.orderId = { contains: orderId };
    }

    if (status) {
      where.status = status;
    }

    const [creditNotes, total] = await Promise.all([
      prisma.creditNote.findMany({
        where,
        include: {
          // Non c'è una relazione diretta, ma possiamo includere l'ordine
          // Ordine: {
          //   select: {
          //     shopifyOrderId: true,
          //     orderNumber: true,
          //     totalPrice: true,
          //   },
          // },
        },
        orderBy: { createdAt: 'desc' },
        skip,
        take: limit,
      }),
      prisma.creditNote.count({ where }),
    ]);

    // Arricchisci con dati degli ordini
    const enrichedCreditNotes = await Promise.all(
      creditNotes.map(async (creditNote) => {
        const order = await prisma.orderSnapshot.findUnique({
          where: { shopifyOrderId: creditNote.orderId },
          select: {
            shopifyOrderId: true,
            orderNumber: true,
            totalPrice: true,
            user: {
              select: {
                email: true,
                firstName: true,
                lastName: true,
              },
            },
          },
        });

        return {
          ...creditNote,
          order,
        };
      })
    );

    return NextResponse.json({
      creditNotes: enrichedCreditNotes,
      pagination: {
        page,
        limit,
        total,
        pages: Math.ceil(total / limit),
      },
    });

  } catch (error) {
    console.error('Error fetching credit notes:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}