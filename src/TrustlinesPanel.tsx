import React, { useState, useEffect } from 'react';
import { useSelector, useDispatch } from 'react-redux';
import { fetchAccountTrustlines, addTrustline, removeTrustline } from '@/services/api';
import { setTrustlines, setLoadingTrustlines } from '@/store/slices/accountSlice';
import { Trustline } from '@/types';

export const TrustlinesPanel: React.FC = () => {
  const dispatch = useDispatch();
  const { publicKey, trustlines, isLoadingTrustlines } = useSelector((state: any) => state.account);

  const [assetCode, setAssetCode] = useState('');
  const [assetIssuer, setAssetIssuer] = useState('');
  const [limit, setLimit] = useState('1000000');
  const [error, setError] = useState<string | null>(null);
  const [warning, setWarning] = useState<string | null>(null);

  const loadTrustlines = async () => {
    dispatch(setLoadingTrustlines(true));
    try {
      const data = await fetchAccountTrustlines(publicKey);
      dispatch(setTrustlines(data));
    } catch (err: any) {
      setError('Failed to fetch account trustlines.');
    } finally {
      dispatch(setLoadingTrustlines(false));
    }
  };

  useEffect(() => {
    if (publicKey) loadTrustlines();
  }, [publicKey]);

  const handleAddTrustline = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    // Validation
    if (!assetCode || assetCode.length > 12) {
      setError('Asset code must be between 1 and 12 alphanumeric characters.');
      return;
    }
    if (!assetIssuer || !assetIssuer.startsWith('G') || assetIssuer.length !== 56) {
      setError('Invalid Stellar issuer public key address.');
      return;
    }

    try {
      await addTrustline(publicKey, { assetCode, assetIssuer, limit });
      setAssetCode('');
      setAssetIssuer('');
      await loadTrustlines(); // Refresh without full page reload
    } catch (err: any) {
      setError(err.message || 'Failed to add trustline.');
    }
  };

  const handleRemoveTrustline = async (item: Trustline) => {
    setError(null);
    setWarning(null);

    // Guard against non-zero balance
    if (parseFloat(item.balance) > 0) {
      setWarning(
        `Cannot remove trustline for ${item.assetCode}. You must transfer or burn your remaining balance of ${item.balance} ${item.assetCode} first.`
      );
      return;
    }

    try {
      await removeTrustline(publicKey, item.assetCode, item.assetIssuer);
      await loadTrustlines(); // Refresh without full page reload
    } catch (err: any) {
      setError(err.message || 'Failed to remove trustline.');
    }
  };

  return (
    <div className="p-6 bg-surface rounded-xl border border-border space-y-6">
      <h3 className="text-lg font-bold">Asset Trustlines</h3>

      {/* Trustline List */}
      {isLoadingTrustlines ? (
        <p className="text-sm text-muted">Loading trustlines...</p>
      ) : trustlines.length === 0 ? (
        <p className="text-sm text-muted">No custom asset trustlines established.</p>
      ) : (
        <div className="space-y-3">
          {trustlines.map((item: Trustline) => (
            <div
              key={`${item.assetCode}-${item.assetIssuer}`}
              className="flex items-center justify-between p-3 bg-background rounded-lg border border-border"
            >
              <div>
                <p className="font-semibold text-sm">
                  {item.assetCode} <span className="text-xs text-muted font-normal">(Balance: {item.balance})</span>
                </p>
                <p className="text-xs text-muted truncate max-w-xs">Issuer: {item.assetIssuer}</p>
                <p className="text-xs text-muted">Limit: {item.limit}</p>
              </div>
              <button
                onClick={() => handleRemoveTrustline(item)}
                className="px-3 py-1 text-xs bg-error/10 text-error rounded hover:bg-error/20 transition"
              >
                Remove
              </button>
            </div>
          ))}
        </div>
      )}

      {/* Warnings & Errors */}
      {warning && <div className="p-3 bg-warning/10 border border-warning/30 rounded text-xs text-warning">{warning}</div>}
      {error && <div className="p-3 bg-error/10 border border-error/30 rounded text-xs text-error">{error}</div>}

      {/* Add Trustline Form */}
      <form onSubmit={handleAddTrustline} className="space-y-3 pt-4 border-t border-border">
        <h4 className="text-sm font-semibold">Add New Trustline</h4>
        <div className="grid grid-cols-2 gap-2">
          <input
            type="text"
            placeholder="Asset Code (e.g. USDC)"
            value={assetCode}
            onChange={(e) => setAssetCode(e.target.value)}
            className="px-3 py-1.5 bg-background border border-border rounded text-sm"
          />
          <input
            type="text"
            placeholder="Limit (default: 1000000)"
            value={limit}
            onChange={(e) => setLimit(e.target.value)}
            className="px-3 py-1.5 bg-background border border-border rounded text-sm"
          />
        </div>
        <input
          type="text"
          placeholder="Issuer Public Address (G...)"
          value={assetIssuer}
          onChange={(e) => setAssetIssuer(e.target.value)}
          className="w-full px-3 py-1.5 bg-background border border-border rounded text-sm"
        />
        <button
          type="submit"
          className="w-full py-2 bg-primary text-primary-foreground font-medium text-sm rounded hover:opacity-90 transition"
        >
          Add Trustline
        </button>
      </form>
    </div>
  );
};