import { Link } from 'react-router-dom'

/** Daftar lapangan bergaya kartu (sama seperti daftar gudang). Klik = buka detail stok lapangan. */
export default function FieldCards({ fields, linkTo, showWarehouse = false }) {
  return (
    <ul className="divide-y rounded border">
      {fields.map((f) => (
        <li key={f.id}>
          <Link to={linkTo(f)} className="flex flex-wrap items-center gap-x-4 gap-y-1 px-4 py-3 hover:bg-slate-50">
            <span className="min-w-0 flex-1">
              <span className={`font-semibold ${f.is_active ? 'text-slate-800' : 'text-slate-400'}`}>{f.name}</span>
              {!f.is_active && <span className="ml-2 rounded-full bg-slate-200 px-2 py-0.5 text-xs font-semibold text-slate-600">Nonaktif</span>}
              <span className="block truncate text-xs text-slate-500">
                {showWarehouse && f.parent ? `Gudang ${f.parent.name} · ` : ''}
                {f.address || 'Alamat belum diisi'}
              </span>
            </span>
            {f.users_count != null && <span className="text-xs text-slate-500">{f.users_count} akun</span>}
            <span className="text-sm text-blue-600">Buka →</span>
          </Link>
        </li>
      ))}
    </ul>
  )
}
