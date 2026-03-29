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
}

const STORAGE_KEY = "claudinho_selected_brand_id";

const BrandContext = createContext<BrandContextType>({
  brands: [],
  selectedBrand: null,
  setSelectedBrand: () => {},
  loading: true,
});

export function BrandProvider({ children }: { children: ReactNode }) {
  const [brands, setBrands] = useState<Brand[]>([]);
  const [selectedBrand, setSelectedBrandState] = useState<Brand | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    fetch("/api/brands")
      .then((r) => r.json())
      .then((json) => {
        const data: Brand[] = json.data ?? [];
        setBrands(data);

        if (data.length > 0) {
          const savedId =
            typeof window !== "undefined"
              ? localStorage.getItem(STORAGE_KEY)
              : null;
          const saved = savedId ? data.find((b) => b.id === savedId) : null;
          setSelectedBrandState(saved ?? data[0]);
        }
      })
      .catch(() => {
        setBrands([]);
      })
      .finally(() => setLoading(false));
  }, []);

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
      value={{ brands, selectedBrand, setSelectedBrand, loading }}
    >
      {children}
    </BrandContext.Provider>
  );
}

export function useBrand() {
  return useContext(BrandContext);
}
