'use client';

import { useState, useEffect } from 'react';
import { BillingForm } from '@/components/BillingForm';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';

interface User {
  id: string;
  email: string;
  firstName?: string;
  lastName?: string;
  countryCode?: string;
}

interface BillingProfile {
  id?: string;
  companyName?: string;
  vatNumber?: string;
  taxCode?: string;
  pec?: string;
  sdiCode?: string;
  addressLine1?: string;
  addressLine2?: string;
  city?: string;
  province?: string;
  postalCode?: string;
  countryCode?: string;
  isBusiness?: boolean;
}

export default function ProfilePage() {
  const [user, setUser] = useState<User | null>(null);
  const [billingProfile, setBillingProfile] = useState<BillingProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  // Estrai il token dall'URL (per Customer Account API)
  useEffect(() => {
    const urlParams = new URLSearchParams(window.location.search);
    const token = urlParams.get('token');
    
    if (token) {
      // Salva il token nel localStorage
      localStorage.setItem('shopify_customer_token', token);
      // Pulisci l'URL
      window.history.replaceState({}, document.title, window.location.pathname);
    }
    
    loadProfileData();
  }, []);

  const loadProfileData = async () => {
    try {
      const token = localStorage.getItem('shopify_customer_token');
      if (!token) {
        setError('Token di autenticazione non trovato. Effettua il login da Shopify.');
        setLoading(false);
        return;
      }

      const response = await fetch('/api/profile/me', {
        headers: {
          'Authorization': `Bearer ${token}`,
        },
      });

      if (!response.ok) {
        if (response.status === 401) {
          setError('Sessione scaduta. Effettua nuovamente il login da Shopify.');
          localStorage.removeItem('shopify_customer_token');
        } else {
          setError('Errore nel caricamento del profilo. Riprova più tardi.');
        }
        setLoading(false);
        return;
      }

      const data = await response.json();
      setUser(data.user);
      setBillingProfile(data.billingProfile);
      setLoading(false);
    } catch (err) {
      console.error('Error loading profile:', err);
      setError('Errore nel caricamento del profilo. Riprova più tardi.');
      setLoading(false);
    }
  };

  const handleSaveProfile = async (profileData: BillingProfile) => {
    setSaving(true);
    setError(null);
    setSuccess(null);

    try {
      const token = localStorage.getItem('shopify_customer_token');
      if (!token) {
        throw new Error('Token di autenticazione non trovato');
      }

      const response = await fetch('/api/profile/me', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(profileData),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Errore durante il salvataggio');
      }

      const data = await response.json();
      setBillingProfile(data.billingProfile);
      setSuccess('Profilo di fatturazione salvato con successo!');
      
      // Nascondi il messaggio di successo dopo 3 secondi
      setTimeout(() => setSuccess(null), 3000);
    } catch (err) {
      console.error('Error saving profile:', err);
      setError(err instanceof Error ? err.message : 'Errore durante il salvataggio');
    } finally {
      setSaving(false);
    }
  };

  const handleLogout = () => {
    localStorage.removeItem('shopify_customer_token');
    setUser(null);
    setBillingProfile(null);
    setError('Sessione terminata. Effettua nuovamente il login da Shopify.');
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto mb-4"></div>
          <p className="text-gray-600">Caricamento profilo...</p>
        </div>
      </div>
    );
  }

  if (error && !user) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <Card className="w-full max-w-md">
          <CardHeader>
            <CardTitle className="text-red-600">Errore di Autenticazione</CardTitle>
            <CardDescription>
              {error}
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Button 
              onClick={() => window.location.href = 'https://shopify.com/account'}
              className="w-full"
            >
              Torna a Shopify
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 py-8">
      <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8">
        {/* Header */}
        <div className="mb-8">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-3xl font-bold text-gray-900">
                Profilo di Fatturazione
              </h1>
              <p className="mt-2 text-gray-600">
                Gestisci i tuoi dati di fatturazione per ordini aziendali
              </p>
            </div>
            <div className="flex items-center space-x-4">
              {user && (
                <div className="text-right">
                  <p className="text-sm text-gray-600">Cliente:</p>
                  <p className="font-medium">{user.email}</p>
                </div>
              )}
              <Button variant="outline" onClick={handleLogout}>
                Logout
              </Button>
            </div>
          </div>
        </div>

        {/* Messaggi */}
        {error && (
          <div className="mb-6 p-4 bg-red-50 border border-red-200 rounded-md">
            <p className="text-red-600">{error}</p>
          </div>
        )}

        {success && (
          <div className="mb-6 p-4 bg-green-50 border border-green-200 rounded-md">
            <p className="text-green-600">{success}</p>
          </div>
        )}

        {/* Stato attuale */}
        {billingProfile && (
          <Card className="mb-8">
            <CardHeader>
              <CardTitle>Stato Attuale</CardTitle>
              <CardDescription>
                Riepilogo del tuo profilo di fatturazione
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div>
                  <h3 className="font-medium mb-2">Tipo Cliente</h3>
                  <div className="flex items-center space-x-2">
                    <Badge variant={billingProfile.isBusiness ? 'success' : 'secondary'}>
                      {billingProfile.isBusiness ? 'Aziendale' : 'Privato'}
                    </Badge>
                    {billingProfile.vatNumber && (
                      <Badge variant="info">P.IVA Presente</Badge>
                    )}
                  </div>
                </div>
                
                <div>
                  <h3 className="font-medium mb-2">Dati Aziendali</h3>
                  {billingProfile.companyName && (
                    <p className="text-sm"><strong>Ragione Sociale:</strong> {billingProfile.companyName}</p>
                  )}
                  {billingProfile.vatNumber && (
                    <p className="text-sm"><strong>P.IVA:</strong> {billingProfile.vatNumber}</p>
                  )}
                  {billingProfile.taxCode && (
                    <p className="text-sm"><strong>Codice Fiscale:</strong> {billingProfile.taxCode}</p>
                  )}
                  {billingProfile.pec && (
                    <p className="text-sm"><strong>PEC:</strong> {billingProfile.pec}</p>
                  )}
                  {billingProfile.sdiCode && (
                    <p className="text-sm"><strong>Codice SDI:</strong> {billingProfile.sdiCode}</p>
                  )}
                </div>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Form di modifica */}
        <BillingForm
          user={user || undefined}
          billingProfile={billingProfile || undefined}
          onSave={handleSaveProfile}
          loading={saving}
        />

        {/* Informazioni aggiuntive */}
        <Card className="mt-8">
          <CardHeader>
            <CardTitle>Informazioni Utili</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-4 text-sm text-gray-600">
              <div>
                <h4 className="font-medium text-gray-900">Perché i dati di fatturazione?</h4>
                <p>
                  Se sei un cliente aziendale con Partita IVA, possiamo emettere fatture elettroniche 
                  conformi alla normativa italiana per i tuoi ordini.
                </p>
              </div>
              
              <div>
                <h4 className="font-medium text-gray-900">Dati richiesti per fattura elettronica</h4>
                <ul className="list-disc list-inside space-y-1">
                  <li>Partita IVA italiana (obbligatoria per clienti business)</li>
                  <li>Codice Fiscale (obbligatorio per persone fisiche)</li>
                  <li>PEC o Codice Destinatario SDI (almeno uno dei due)</li>
                  <li>Indirizzo completo in Italia</li>
                </ul>
              </div>
              
              <div>
                <h4 className="font-medium text-gray-900">Privacy e Sicurezza</h4>
                <p>
                  I tuoi dati di fatturazione sono conservati in modo sicuro e utilizzati 
                  esclusivamente per l'emissione di fatture conformi alla normativa. 
                  Non condividiamo queste informazioni con terze parti.
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}