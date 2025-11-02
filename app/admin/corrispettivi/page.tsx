'use client';

import { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';

interface Order {
  id: string;
  shopifyOrderId: string;
  orderNumber: string;
  currency: string;
  totalPrice: number;
  createdAt: string;
  shopifyCreatedAt: string;
  hasVatProfile: boolean;
  invoiceStatus: 'CORRISPETTIVO';
  user: {
    email: string;
    firstName?: string;
    lastName?: string;
    billingProfile?: {
      companyName?: string;
      vatNumber?: string;
      isBusiness: boolean;
    };
  };
}

export default function CorrispettiviPage() {
  const [adminPassword, setAdminPassword] = useState('');
  const [orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(0);
  const [fromDate, setFromDate] = useState('');
  const [toDate, setToDate] = useState('');
  const [totalRevenue, setTotalRevenue] = useState(0);

  // Recupera password da sessionStorage
  useEffect(() => {
    const savedPassword = sessionStorage.getItem('adminPassword');
    if (savedPassword) {
      setAdminPassword(savedPassword);
    } else {
      window.location.href = '/admin';
    }
  }, []);

  // Carica ordini solo se autenticato
  useEffect(() => {
    if (adminPassword) {
      loadCorrispettivi();
    }
  }, [page, search, fromDate, toDate, adminPassword]);

  const loadCorrispettivi = async () => {
    try {
      setLoading(true);
      setError(null);

      const params = new URLSearchParams();
      params.append('page', page.toString());
      params.append('limit', '50'); // Mostriamo più risultati per una panoramica migliore
      params.append('status', 'CORRISPETTIVO');

      if (search) {
        params.append('search', search);
      }
      
      if (fromDate) {
        params.append('from', fromDate);
      }
      
      if (toDate) {
        params.append('to', toDate);
      }

      const response = await fetch(`/api/admin/orders?${params.toString()}`, {
        headers: {
          'Authorization': `Bearer ${adminPassword}`,
        },
      });

      if (!response.ok) {
        throw new Error('Errore nel caricamento corrispettivi');
      }

      const data = await response.json();
      setOrders(data.orders || []);
      setTotalPages(data.pagination?.pages || 1);
      
      // Calcola revenue totale
      const revenue = data.orders.reduce((sum: number, order: Order) => sum + (order.totalPrice || 0), 0);
      setTotalRevenue(revenue);

    } catch (err) {
      console.error('Error loading corrispettivi:', err);
      setError('Errore nel caricamento corrispettivi');
    } finally {
      setLoading(false);
    }
  };

  const handleSearch = (e: React.ChangeEvent<HTMLInputElement>) => {
    setSearch(e.target.value);
    setPage(1);
  };

  const handleDateFilter = () => {
    setPage(1);
  };

  const handlePageChange = (newPage: number) => {
    setPage(newPage);
    window.scrollTo(0, 0);
  };

  if (!adminPassword) {
    return null;
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Header */}
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-gray-900">
            📋 Corrispettivi
          </h1>
          <p className="mt-2 text-gray-600">
            Ordini di clienti privati (non soggetti a fatturazione)
          </p>
        </div>

        {/* Error */}
        {error && (
          <div className="mb-6 p-4 bg-red-50 border border-red-200 rounded-md">
            <p className="text-red-600">{error}</p>
          </div>
        )}

        {/* Stats Card */}
        <Card className="mb-8">
          <CardHeader>
            <CardTitle>📊 Statistiche Corrispettivi</CardTitle>
            <CardDescription>
              Panoramica ordini corrispettivi
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              <div>
                <div className="text-sm text-gray-500">Totale Ordini</div>
                <div className="text-3xl font-bold text-gray-900">{orders.length}</div>
              </div>
              <div>
                <div className="text-sm text-gray-500">Revenue Totale</div>
                <div className="text-3xl font-bold text-gray-900">
                  € {totalRevenue.toFixed(2)}
                </div>
              </div>
              <div>
                <div className="text-sm text-gray-500">Valore Medio</div>
                <div className="text-3xl font-bold text-gray-900">
                  € {orders.length > 0 ? (totalRevenue / orders.length).toFixed(2) : '0.00'}
                </div>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Filters */}
        <Card className="mb-8">
          <CardHeader>
            <CardTitle>Filtri</CardTitle>
            <CardDescription>
              Cerca corrispettivi per numero ordine o periodo
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
              <Input
                placeholder="Cerca per numero ordine..."
                value={search}
                onChange={handleSearch}
              />
              <Input
                type="date"
                placeholder="Data da..."
                value={fromDate}
                onChange={(e) => setFromDate(e.target.value)}
                onBlur={handleDateFilter}
              />
              <Input
                type="date"
                placeholder="Data a..."
                value={toDate}
                onChange={(e) => setToDate(e.target.value)}
                onBlur={handleDateFilter}
              />
              <Button
                variant="outline"
                onClick={() => window.location.href = '/admin/orders'}
              >
                ← Tutti gli Ordini
              </Button>
            </div>
          </CardContent>
        </Card>

        {/* Orders Table */}
        <Card>
          <CardHeader>
            <CardTitle>Elenco Corrispettivi ({orders.length})</CardTitle>
            <CardDescription>
              Pagina {page} di {totalPages}
            </CardDescription>
          </CardHeader>
          <CardContent>
            {loading ? (
              <div className="text-center py-8">
                <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-gray-600 mx-auto mb-4"></div>
                <p className="text-gray-600">Caricamento corrispettivi...</p>
              </div>
            ) : orders.length === 0 ? (
              <div className="text-center py-8 text-gray-500">
                Nessun corrispettivo trovato
              </div>
            ) : (
              <>
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Numero Ordine</TableHead>
                        <TableHead>Cliente</TableHead>
                        <TableHead>Importo</TableHead>
                        <TableHead>Data</TableHead>
                        <TableHead>Valuta</TableHead>
                        <TableHead>Stato</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {orders.map((order) => (
                        <TableRow key={order.id}>
                          <TableCell className="font-mono text-sm">
                            #{order.orderNumber || order.shopifyOrderId}
                          </TableCell>
                          <TableCell>
                            <div>
                              <div className="font-medium">{order.user.email}</div>
                              {(order.user.firstName || order.user.lastName) && (
                                <div className="text-sm text-gray-500">
                                  {order.user.firstName} {order.user.lastName}
                                </div>
                              )}
                            </div>
                          </TableCell>
                          <TableCell className="font-medium">
                            {order.currency} {order.totalPrice?.toFixed(2) || '0.00'}
                          </TableCell>
                          <TableCell>
                            {new Date(order.shopifyCreatedAt || order.createdAt).toLocaleDateString('it-IT')}
                          </TableCell>
                          <TableCell>{order.currency}</TableCell>
                          <TableCell>
                            <Badge className="bg-gray-600">Corrispettivo</Badge>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>

                {/* Pagination */}
                {totalPages > 1 && (
                  <div className="flex justify-center items-center gap-4 mt-6">
                    <Button
                      variant="outline"
                      onClick={() => handlePageChange(page - 1)}
                      disabled={page === 1}
                    >
                      Precedente
                    </Button>
                    <span className="text-sm text-gray-600">
                      Pagina {page} di {totalPages}
                    </span>
                    <Button
                      variant="outline"
                      onClick={() => handlePageChange(page + 1)}
                      disabled={page === totalPages}
                    >
                      Successivo
                    </Button>
                  </div>
                )}
              </>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

