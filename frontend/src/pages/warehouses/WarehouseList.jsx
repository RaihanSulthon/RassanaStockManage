import { useMemo, useState } from "react";
import { Link, Navigate, useNavigate } from "react-router-dom";
import { Alert, Button, Card, PageHeader } from "../../components/ui";
import { useAuth } from "../../context/AuthContext";
import { useApi, useDebounced } from "../../lib/hooks";
import { isPrivileged } from "../../lib/roles";
import LocationFormModal from "./LocationFormModal";

const PER_PAGE = 10;

const inactiveBadge = (row) =>
  !row.is_active ? (
    <span className="ml-2 rounded-full bg-slate-200 px-2 py-0.5 text-xs font-semibold text-slate-600">
      Nonaktif
    </span>
  ) : null;

/**
 * Menu Gudang: pilih gudang dulu, lalu kelola stok, barang & harga, vendor, dan lapangan di dalamnya.
 * Admin/Purchasing/Finance melihat semua gudang; Operation hanya gudang yang ditugaskan.
 */
export default function WarehouseList() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const isAdmin = user.role === "admin";
  const privileged = isPrivileged(user.role);
  const { data, loading, error, reload } = useApi("/locations", { all: 1 });
  const all = useMemo(() => data?.data || [], [data]);

  const [search, setSearch] = useState("");
  const q = useDebounced(search.trim().toLowerCase(), 200);
  const [status, setStatus] = useState("active"); // active | inactive | all
  const [page, setPage] = useState(1);
  const [creating, setCreating] = useState(false);

  const warehouses = all.filter((l) => l.type === "warehouse");
  const fieldsOf = (wid) =>
    all.filter((l) => l.type === "field" && l.parent_id === wid);
  const statusOk = (l) =>
    status === "all" || (status === "active" ? l.is_active : !l.is_active);
  const matches = (l) =>
    !q ||
    l.name.toLowerCase().includes(q) ||
    (l.address || "").toLowerCase().includes(q);

  // Operation dengan satu gudang langsung masuk ke gudangnya.
  if (!privileged && data && warehouses.length === 1)
    return <Navigate to={`/warehouses/${warehouses[0].id}`} replace />;

  // Pencarian juga melihat nama lapangan, supaya gudang tempat lapangan itu berada ikut ketemu.
  const rows = warehouses
    .filter(statusOk)
    .map((w) => {
      const fields = fieldsOf(w.id);
      const fieldHits = q && !matches(w) ? fields.filter(matches) : [];
      return {
        w,
        fields,
        fieldHits,
        visible: matches(w) || fieldHits.length > 0,
      };
    })
    .filter((r) => r.visible);

  const lastPage = Math.max(1, Math.ceil(rows.length / PER_PAGE));
  const current = Math.min(page, lastPage);
  const pageRows = rows.slice((current - 1) * PER_PAGE, current * PER_PAGE);

  return (
    <div>
      <PageHeader
        title="Gudang"
        subtitle={
          isAdmin
            ? "Buat gudang terlebih dahulu, lalu buka gudang untuk mengelola stok, barang & harga, vendor, dan lapangannya."
            : "Pilih gudang untuk melihat stok, barang, vendor, dan lapangan di dalamnya."
        }
      >
        {isAdmin && (
          <Button size="sm" onClick={() => setCreating(true)}>
            + Gudang
          </Button>
        )}
      </PageHeader>

      <Card>
        <div className="mb-4 flex flex-wrap items-center gap-2">
          <input
            type="search"
            placeholder="Cari gudang / lapangan / alamat..."
            value={search}
            onChange={(e) => (setSearch(e.target.value), setPage(1))}
            className="min-w-0 flex-1 rounded border border-slate-300 px-3 py-1.5 text-sm sm:max-w-xs"
          />
          <div className="flex rounded border border-slate-300 text-sm">
            {[
              ["active", "Aktif"],
              ["inactive", "Nonaktif"],
              ["all", "Semua"],
            ].map(([v, l]) => (
              <button
                key={v}
                onClick={() => (setStatus(v), setPage(1))}
                className={`px-3 py-1.5 ${status === v ? "bg-slate-900 text-white" : "text-slate-600 hover:bg-slate-100"}`}
              >
                {l}
              </button>
            ))}
          </div>
          <span className="text-sm text-slate-500 sm:ml-auto">
            {warehouses.length} gudang
          </span>
        </div>

        <Alert>{error}</Alert>

        {loading && !data ? (
          <p className="py-6 text-center text-slate-500">Memuat...</p>
        ) : warehouses.length === 0 ? (
          <div className="py-8 text-center text-slate-500">
            {isAdmin ? (
              <>
                Belum ada gudang. Mulai dengan{" "}
                <button
                  className="text-blue-600 hover:underline"
                  onClick={() => setCreating(true)}
                >
                  menambah gudang
                </button>
                .
              </>
            ) : (
              "Akun Anda belum ditugaskan ke gudang. Hubungi Admin."
            )}
          </div>
        ) : rows.length === 0 ? (
          <p className="py-6 text-center text-slate-500">
            Tidak ada gudang yang cocok.
          </p>
        ) : (
          <>
            <ul className="divide-y rounded border">
              {pageRows.map(({ w, fields, fieldHits }) => (
                <li key={w.id}>
                  <Link
                    to={`/warehouses/${w.id}`}
                    className="flex flex-wrap items-center gap-x-4 gap-y-1 px-4 py-3 hover:bg-slate-50"
                  >
                    <span className="min-w-0 flex-1">
                      <span
                        className={`font-semibold ${w.is_active ? "text-slate-800" : "text-slate-400"}`}
                      >
                        {w.name}
                      </span>
                      {inactiveBadge(w)}
                      <span className="block truncate text-xs text-slate-500">
                        {w.address || "Alamat belum diisi"}
                      </span>
                      {fieldHits.length > 0 && (
                        <span className="block truncate text-xs text-blue-700">
                          Lapangan cocok:{" "}
                          {fieldHits.map((f) => f.name).join(", ")}
                        </span>
                      )}
                    </span>
                    <span className="text-xs text-slate-500">
                      {w.items_count ?? 0} barang · {fields.length} lapangan
                      {privileged ? ` · ${w.vendors_count ?? 0} vendor` : ""}
                    </span>
                    <span className="text-sm text-blue-600">Buka →</span>
                  </Link>
                </li>
              ))}
            </ul>

            {lastPage > 1 && (
              <div className="mt-4 flex items-center justify-between text-sm text-slate-600">
                <span>
                  Halaman {current} dari {lastPage} · {rows.length} gudang
                </span>
                <div className="flex gap-2">
                  <button
                    disabled={current <= 1}
                    onClick={() => setPage(current - 1)}
                    className="rounded border px-3 py-1 disabled:opacity-40"
                  >
                    Sebelumnya
                  </button>
                  <button
                    disabled={current >= lastPage}
                    onClick={() => setPage(current + 1)}
                    className="rounded border px-3 py-1 disabled:opacity-40"
                  >
                    Berikutnya
                  </button>
                </div>
              </div>
            )}
          </>
        )}
      </Card>

      {creating && (
        <LocationFormModal
          type="warehouse"
          onClose={() => setCreating(false)}
          onSaved={(w) => {
            setCreating(false);
            reload();
            // Langsung ke gudang baru supaya bisa lanjut menambah barang & lapangan.
            if (w?.id) navigate(`/warehouses/${w.id}?tab=barang`);
          }}
        />
      )}
    </div>
  );
}
