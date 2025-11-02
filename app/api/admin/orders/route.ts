import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

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
    const from = searchParams.get('from');
    const to = searchParams.get('to');
    const status = searchParams.get('status');
    const hasVatProfile = searchParams.get('hasVatProfile');

    const skip = (page - 1) * limit;

    // Costruisci filtri
    const where: any = {};

    if (from || to) {
      where.shopifyCreatedAt = {};
      if (from) {
        where.shopifyCreatedAt.gte = new Date(from);
      }
      if (to) {
        where.shopifyCreatedAt.lte = new Date(to);
      }
    }

    if (status) {
      where.invoiceStatus = status;
    }

    if (hasVatProfile !== null && hasVatProfile !== undefined) {
      where.hasVatProfile = hasVatProfile === 'true';
    }

    const [orders, total] = await Promise.all([
      prisma.orderSnapshot.findMany({
        where,
        include: {
          user: {
            include: {
              billingProfile: true,
            },
          },
        },
        orderBy: { shopifyCreatedAt: 'desc' },
        skip,
        take: limit,
      }),
      prisma.orderSnapshot.count({ where }),
    ]);

    // Calcola statistiche
    const stats = await prisma.orderSnapshot.groupBy({
      by: ['invoiceStatus'],
      where: from || to ? {
        shopifyCreatedAt: {
          ...(from && { gte: new Date(from) }),
          ...(to && { lte: new Date(to) }),
        },
      } : undefined,
      _count: {
        id: true,
      },
      _sum: {
        totalPrice: true,
      },
    });

    const statsMap = stats.reduce((acc, stat) => {
      acc[stat.invoiceStatus] = {
        count: stat._count.id,
        total: stat._sum.totalPrice ? Number(stat._sum.totalPrice) : 0,
      };
      return acc;
    }, {} as Record<string, { count: number; total: number }>);

    return NextResponse.json({
      orders,
      pagination: {
        page,
        limit,
        total,
        pages: Math.ceil(total / limit),
      },
      stats: {
        PENDING: statsMap.PENDING || { count: 0, total: 0 },
        ISSUED: statsMap.ISSUED || { count: 0, total: 0 },
        ERROR: statsMap.ERROR || { count: 0, total: 0 },
        FOREIGN: statsMap.FOREIGN || { count: 0, total: 0 },
      },
    });

  } catch (error) {
    console.error('Error fetching orders:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

// POST - Azioni batch sugli ordini
export async function POST(request: NextRequest) {
  try {
    // Verifica autenticazione admin
    const adminPassword = process.env.ADMIN_PASSWORD;
    const authHeader = request.headers.get('authorization');
    
    if (!adminPassword || !authHeader || authHeader !== `Bearer ${adminPassword}`) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json();
    const { action, orderIds } = body;

    if (!action || !Array.isArray(orderIds)) {
      return NextResponse.json(
        { error: 'Invalid request body' },
        { status: 400 }
      );
    }

    let result;

    switch (action) {
      case 'retry_invoices':
        // Riaccoda gli ordini per l'emissione fatture
        result = await Promise.all(
          orderIds.map(async (orderId: string) => {
            try {
              const order = await prisma.orderSnapshot.findUnique({
                where: { shopifyOrderId: orderId },
              });

              if (!order) {
                return { orderId, success: false, error: 'Order not found' };
              }

              if (order.invoiceStatus !== 'PENDING') {
                return { orderId, success: false, error: 'Order not in PENDING status' };
              }

              await prisma.queueJob.create({
                data: {
                  type: 'invoice',
                  payload: { shopifyOrderId: orderId },
                  status: 'PENDING',
                  scheduledAt: new Date(),
                },
              });

              return { orderId, success: true };
            } catch (error) {
              return { orderId, success: false, error: error instanceof Error ? error.message : 'Unknown error' };
            }
          })
        );
        break;

      case 'reset_errors':
        // Resetta gli ordini in errore a PENDING
        result = await prisma.orderSnapshot.updateMany({
          where: {
            shopifyOrderId: { in: orderIds },
            invoiceStatus: 'ERROR',
          },
          data: {
            invoiceStatus: 'PENDING',
            lastError: null,
          },
        });
        result = { updatedCount: result.count };
        break;

      default:
        return NextResponse.json(
          { error: 'Invalid action' },
          { status: 400 }
        );
    }

    return NextResponse.json({
      success: true,
      result,
    });

  } catch (error) {
    console.error('Error processing batch orders action:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}