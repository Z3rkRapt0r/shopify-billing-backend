'use client';

import { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';

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

interface User {
  id: string;
  email: string;
  firstName?: string;
  lastName?: string;
  countryCode?: string;
}

interface BillingFormProps {
  user?: User;
  billingProfile?: BillingProfile;
  onSave: (data: BillingProfile) => Promise<void>;
  loading?: boolean;
}

export function BillingForm({ user, billingProfile, onSave, loading = false }: BillingFormProps) {
  const [formData, setFormData] = useState<BillingProfile>({
    companyName: billingProfile?.companyName || '',
    vatNumber: billingProfile?.vatNumber || '',
    taxCode: billingProfile?.taxCode || '',
    pec: billingProfile?.pec || '',
    sdiCode: billingProfile?.sdiCode || '',
    addressLine1: billingProfile?.addressLine1 || '',
    addressLine2: billingProfile?.addressLine2 || '',
    city: billingProfile?.city || '',
    province: billingProfile?.province || '',
    postalCode: billingProfile?.postalCode || '',
    countryCode: billingProfile?.countryCode || user?.countryCode || 'IT',
    isBusiness: billingProfile?.isBusiness || false,
  });

  const [errors, setErrors] = useState<Record<string, string>>({});
  const [isSaving, setIsSaving] = useState(false);

  // Validazione P.IVA
  const validateVatNumber = (vat: string): boolean => {
    if (!vat) return true; // optional
    const cleanVat = vat.replace(/\s/g, '').replace(/^IT/, '');
    return /^[0-9]{11}$/.test(cleanVat);
  };

  // Validazione Codice Fiscale
  const validateTaxCode = (taxCode: string): boolean => {
    if (!taxCode) return true; // optional
    const cleanTaxCode = taxCode.replace(/\s/g, '').toUpperCase();
    return /^[A-Z0-9]{16}$/.test(cleanTaxCode);
  };

  // Validazione Codice SDI
  const validateSdiCode = (sdiCode: string): boolean => {
    if (!sdiCode) return true; // optional
    return sdiCode.length === 7;
  };

  const handleInputChange = (field: string, value: string) => {
    setFormData(prev => ({ ...prev, [field]: value }));
    
    // Pulisci errori quando l'utente corregge
    if (errors[field]) {
      setErrors(prev => ({ ...prev, [field]: '' }));
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    const newErrors: Record<string, string> = {};

    // Validazioni
    if (formData.vatNumber && !validateVatNumber(formData.vatNumber)) {
      newErrors.vatNumber = 'P.IVA non valida. Deve contenere 11 cifre (opzionalmente precedute da IT)';
    }

    if (formData.taxCode && !validateTaxCode(formData.taxCode)) {
      newErrors.taxCode = 'Codice Fiscale non valido. Deve contenere 16 caratteri alfanumerici';
    }

    if (formData.sdiCode && !validateSdiCode(formData.sdiCode)) {
      newErrors.sdiCode = 'Codice Destinatario non valido. Deve contenere 7 caratteri';
    }

    if (formData.pec && !formData.pec.includes('@')) {
      newErrors.pec = 'PEC non valida';
    }

    if (Object.keys(newErrors).length > 0) {
      setErrors(newErrors);
      return;
    }

    // Se viene fornita una P.IVA, imposta automaticamente isBusiness a true
    const finalData = {
      ...formData,
      isBusiness: !!formData.vatNumber,
    };

    setIsSaving(true);
    try {
      await onSave(finalData);
      setErrors({});
    } catch (error) {
      console.error('Error saving billing profile:', error);
      setErrors({ submit: 'Errore durante il salvataggio. Riprova.' });
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <Card className="w-full max-w-2xl mx-auto">
      <CardHeader>
        <CardTitle>Profilo di Fatturazione</CardTitle>
        <CardDescription>
          {user ? `Gestisci i dati di fatturazione per ${user.email}` : 'Compila i tuoi dati di fatturazione'}
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSubmit} className="space-y-6">
          {/* Informazioni Aziendali */}
          <div className="space-y-4">
            <h3 className="text-lg font-medium">Informazioni Aziendali</h3>
            
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="companyName">Ragione Sociale</Label>
                <Input
                  id="companyName"
                  value={formData.companyName}
                  onChange={(e) => handleInputChange('companyName', e.target.value)}
                  placeholder="La tua azienda"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="vatNumber">Partita IVA</Label>
                <Input
                  id="vatNumber"
                  value={formData.vatNumber}
                  onChange={(e) => handleInputChange('vatNumber', e.target.value.toUpperCase())}
                  placeholder="IT01234567890"
                  className={errors.vatNumber ? 'border-red-500' : ''}
                />
                {errors.vatNumber && (
                  <p className="text-sm text-red-500">{errors.vatNumber}</p>
                )}
              </div>

              <div className="space-y-2">
                <Label htmlFor="taxCode">Codice Fiscale</Label>
                <Input
                  id="taxCode"
                  value={formData.taxCode}
                  onChange={(e) => handleInputChange('taxCode', e.target.value.toUpperCase())}
                  placeholder="RSSMRA80A01H501U"
                  className={errors.taxCode ? 'border-red-500' : ''}
                />
                {errors.taxCode && (
                  <p className="text-sm text-red-500">{errors.taxCode}</p>
                )}
              </div>

              <div className="space-y-2">
                <Label htmlFor="pec">PEC</Label>
                <Input
                  id="pec"
                  type="email"
                  value={formData.pec}
                  onChange={(e) => handleInputChange('pec', e.target.value)}
                  placeholder="fatturazione@pec.it"
                  className={errors.pec ? 'border-red-500' : ''}
                />
                {errors.pec && (
                  <p className="text-sm text-red-500">{errors.pec}</p>
                )}
              </div>

              <div className="space-y-2">
                <Label htmlFor="sdiCode">Codice Destinatario SDI</Label>
                <Input
                  id="sdiCode"
                  value={formData.sdiCode}
                  onChange={(e) => handleInputChange('sdiCode', e.target.value)}
                  placeholder="0000000"
                  maxLength={7}
                  className={errors.sdiCode ? 'border-red-500' : ''}
                />
                {errors.sdiCode && (
                  <p className="text-sm text-red-500">{errors.sdiCode}</p>
                )}
              </div>
            </div>
          </div>

          {/* Indirizzo */}
          <div className="space-y-4">
            <h3 className="text-lg font-medium">Indirizzo</h3>
            
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-2 md:col-span-2">
                <Label htmlFor="addressLine1">Indirizzo</Label>
                <Input
                  id="addressLine1"
                  value={formData.addressLine1}
                  onChange={(e) => handleInputChange('addressLine1', e.target.value)}
                  placeholder="Via Roma 1"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="addressLine2">Indirizzo (continuazione)</Label>
                <Input
                  id="addressLine2"
                  value={formData.addressLine2}
                  onChange={(e) => handleInputChange('addressLine2', e.target.value)}
                  placeholder="Appartamento 5"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="city">Città</Label>
                <Input
                  id="city"
                  value={formData.city}
                  onChange={(e) => handleInputChange('city', e.target.value)}
                  placeholder="Milano"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="province">Provincia</Label>
                <Input
                  id="province"
                  value={formData.province}
                  onChange={(e) => handleInputChange('province', e.target.value.toUpperCase())}
                  placeholder="MI"
                  maxLength={2}
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="postalCode">CAP</Label>
                <Input
                  id="postalCode"
                  value={formData.postalCode}
                  onChange={(e) => handleInputChange('postalCode', e.target.value)}
                  placeholder="20121"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="countryCode">Paese</Label>
                <Input
                  id="countryCode"
                  value={formData.countryCode}
                  onChange={(e) => handleInputChange('countryCode', e.target.value.toUpperCase())}
                  placeholder="IT"
                  maxLength={2}
                />
              </div>
            </div>
          </div>

          {/* Stato attuale */}
          {billingProfile && (
            <div className="flex items-center space-x-2">
              <span className="text-sm font-medium">Stato attuale:</span>
              <Badge variant={billingProfile.isBusiness ? 'success' : 'secondary'}>
                {billingProfile.isBusiness ? 'Aziendale' : 'Privato'}
              </Badge>
              {billingProfile.vatNumber && (
                <Badge variant="info">P.IVA Presente</Badge>
              )}
            </div>
          )}

          {/* Errori generali */}
          {errors.submit && (
            <div className="p-3 bg-red-50 border border-red-200 rounded-md">
              <p className="text-sm text-red-600">{errors.submit}</p>
            </div>
          )}

          {/* Pulsanti */}
          <div className="flex justify-end space-x-4">
            <Button
              type="submit"
              disabled={isSaving || loading}
              className="min-w-[120px]"
            >
              {isSaving ? 'Salvataggio...' : 'Salva'}
            </Button>
          </div>
        </form>
      </CardContent>
    </Card>
  );
}