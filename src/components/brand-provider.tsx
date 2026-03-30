"use client";

import {
  createContext,
  useContext,
  useState,
  useEffect,
  useCallback,
  type ReactNode,
} from "react";

export interface Brand {
  id: string;
  name: string;
  meta_account_id: string;
  meta_page_id: string;
}

interface BrandContextType {
  brands: Brand[];
  selectedBrand: Brand | null;
  setSelectedBrand: (brand: Brand) => void;
  loading: boolean;
  error: string | null;
  reloadBrands: () => Promise<void>;
}

const STORAGE_KEY = "claudinho_selected_brand_id";

const BrandContext = createContext<BrandContextType>({
  brands: [],
  selectedBrand: null,
  setSelectedBrand: () => {},
  loading: true,
  error: null,
  reloadBrands: async () => {},
});

export function BrandProvider({ children }: { children: ReactNode }) {
  const [brands, setBrands] = useState<Brand[]>([]);
  const [selectedBrand, setSelectedBrandState] = useState<Brand | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const carregarBrands = useCallback(async () => {
    setLoading(true);
    setError(null);

    try {
      const response = await fetch("/api/brands");
      const json = await response.json();

      if (!response.ok) {
        throw new Error(json.erro ?? "Erro ao carregar marcas");
      }

      const data: Brand[] = json.data ?? [];
      setBrands(data);

      if (data.length > 0) {
        const savedId =
          typeof window !== "undefined"
            ? localStorage.getItem(STORAGE_KEY)
            : null;
        const saved = savedId ? data.find((b) => b.id === savedId) : null;
        setSelectedBrandState(saved ?? data[0]);
      } else {
        setSelectedBrandState(null);
        setError("Nenhuma marca foi encontrada no banco.");
      }
    } catch (err) {
      setBrands([]);
      setSelectedBrandState(null);
      setError(
        err instanceof Error ? err.message : "Erro ao carregar marcas"
      );
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void carregarBrands();
  }, [carregarBrands]);

  const setSelectedBrand = useCallback(
    (brand: Brand) => {
      setSelectedBrandState(brand);
      if (typeof window !== "undefined") {
        localStorage.setItem(STORAGE_KEY, brand.id);
      }
    },
    []
  );

  return (
    <BrandContext.Provider
      value={{
        brands,
        selectedBrand,
        setSelectedBrand,
        loading,
        error,
        reloadBrands: carregarBrands,
      }}
    >
      {children}
    </BrandContext.Provider>
  );
}

export function useBrand() {
  return useContext(BrandContext);
}
