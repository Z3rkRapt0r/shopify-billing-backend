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
    const from = searchParams.get('from');
    const to = searchParams.get('to');

    // Costruisci filtri per periodo
    const dateFilter: any = {};
    if (from || to) {
      dateFilter.shopifyCreatedAt = {};
      if (from) {
        dateFilter.shopifyCreatedAt.gte = new Date(from);
      }
      if (to) {
        dateFilter.shopifyCreatedAt.lte = new Date(to);
      }
    }

    // Calcola KPI
    const [
      totalUsers,
      businessUsers,
      totalOrders,
      pendingInvoices,
      issuedInvoices,
      errorInvoices,
      foreignOrders,
    ] = await Promise.all([
      // Clienti totali
      prisma.user.count(),
      
      // Clienti business
      prisma.billingProfile.count({
        where: { isBusiness: true },
      }),
      
      // Ordini totali
      prisma.orderSnapshot.count({
        where: dateFilter,
      }),
      
      // Fatture in attesa
      prisma.orderSnapshot.count({
        where: {
          ...dateFilter,
          invoiceStatus: 'PENDING',
        },
      }),
      
      // Fatture emesse
      prisma.orderSnapshot.count({
        where: {
          ...dateFilter,
          invoiceStatus: 'ISSUED',
        },
      }),
      
      // Fatture con errori
      prisma.orderSnapshot.count({
        where: {
          ...dateFilter,
          invoiceStatus: 'ERROR',
        },
      }),
      
      // Ordini esteri
      prisma.orderSnapshot.count({
        where: {
          ...dateFilter,
          invoiceStatus: 'FOREIGN',
        },
      }),
    ]);

    // Calcola totali monetari
    const [
      totalRevenue,
      pendingRevenue,
      issuedRevenue,
      errorRevenue,
      foreignRevenue,
    ] = await Promise.all([
      // Revenue totale
      prisma.orderSnapshot.aggregate({
        where: dateFilter,
        _sum: { totalPrice: true },
      }),
      
      // Revenue in attesa
      prisma.orderSnapshot.aggregate({
        where: {
          ...dateFilter,
          invoiceStatus: 'PENDING',
        },
        _sum: { totalPrice: true },
      }),
      
      // Revenue emesso
      prisma.orderSnapshot.aggregate({
        where: {
          ...dateFilter,
          invoiceStatus: 'ISSUED',
        },
        _sum: { totalPrice: true },
      }),
      
      // Revenue con errori
      prisma.orderSnapshot.aggregate({
        where: {
          ...dateFilter,
          invoiceStatus: 'ERROR',
        },
        _sum: { totalPrice: true },
      }),
      
      // Revenue estero
      prisma.orderSnapshot.aggregate({
        where: {
          ...dateFilter,
          invoiceStatus: 'FOREIGN',
        },
        _sum: { totalPrice: true },
      }),
    ]);

    // Statistiche per stato
    const statusStats = await prisma.orderSnapshot.groupBy({
      by: ['invoiceStatus'],
      where: dateFilter,
      _count: {
        id: true,
      },
      _sum: {
        totalPrice: true,
      },
    });

    // Statistiche per mese (ultimi 6 mesi)
    const sixMonthsAgo = new Date();
    sixMonthsAgo.setMonth(sixMonthsAgo.getMonth() - 6);
    
    const monthlyStats = await prisma.$queryRaw`
      SELECT 
        DATE_TRUNC('month', "shopifyCreatedAt") as month,
        COUNT(*) as orders_count,
        COALESCE(SUM("totalPrice"), 0) as revenue,
        COUNT(CASE WHEN "invoiceStatus" = 'ISSUED' THEN 1 END) as invoices_issued,
        COUNT(CASE WHEN "invoiceStatus" = 'ERROR' THEN 1 END) as invoices_error
      FROM "OrderSnapshot"
      WHERE "shopifyCreatedAt" >= ${sixMonthsAgo}
      GROUP BY DATE_TRUNC('month', "shopifyCreatedAt")
      ORDER BY month DESC
      LIMIT 6
    `;

    return NextResponse.json({
      // KPI base
      totalUsers,
      businessUsers,
      totalOrders,
      pendingInvoices,
      issuedInvoices,
      errorInvoices,
      foreignOrders,
      
      // Revenue
      totalRevenue: totalRevenue._sum.totalPrice || 0,
      pendingRevenue: pendingRevenue._sum.totalPrice || 0,
      issuedRevenue: issuedRevenue._sum.totalPrice || 0,
      errorRevenue: errorRevenue._sum.totalPrice || 0,
      foreignRevenue: foreignRevenue._sum.totalPrice || 0,
      
      // Statistiche dettagliate
      statusStats: statusStats.reduce((acc, stat) => {
        acc[stat.invoiceStatus] = {
          count: stat._count.id,
          revenue: stat._sum.totalPrice || 0,
        };
        return acc;
      }, {} as Record<string, { count: number; revenue: number }>),
      
      // Statistiche mensili
      monthlyStats: monthlyStats.map((stat: any) => ({
        month: stat.month,
        ordersCount: parseInt(stat.orders_count),
        revenue: parseFloat(stat.revenue),
        invoicesIssued: parseInt(stat.invoices_issued),
        invoicesError: parseInt(stat.invoices_error),
      })),
      
      // Metriche calcolate
      businessPercentage: totalUsers > 0 ? Math.round((businessUsers / totalUsers) * 100) : 0,
      invoiceSuccessRate: totalOrders > 0 ? Math.round((issuedInvoices / totalOrders) * 100) : 0,
      errorRate: totalOrders > 0 ? Math.round((errorInvoices / totalOrders) * 100) : 0,
    });

  } catch (error) {
    console.error('Error fetching admin stats:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}