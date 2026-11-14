import { formatQty } from '../lib/format'

let seq = 0
// eslint-disable-next-line react-refresh/only-export-components
export const newLine = (data = {}) => ({ key: ++seq, item_id: '', quantity: '', note: '', ...data })

/**
 * Tabel baris barang (pilih barang dari master + jumlah + catatan).
 * extraColumns: [{ label, render: (row, index, item) => node, className }]
 */
export default function LineItemsEditor({
  items,
  rows,
  setRows,
  editable,
  errors = {},
  qtyField = 'quantity',
  qtyLabel = 'Jumlah',
  extraColumns = [],
  showNote = true,
}) {
  const byId = Object.fromEntries(items.map((i) => [i.id, i]))
  const update = (key, patch) => setRows((rs) => rs.map((r) => (r.key === key ? { ...r, ...patch } : r)))
  const remove = (key) => setRows((rs) => (rs.length > 1 ? rs.filter((r) => r.key !== key) : [newLine()]))
  const err = (i, f) => errors[`items.${i}.${f}`]?.[0]
  const used = new Set(rows.map((r) => Number(r.item_id)))

  const groups = ['bahan', 'barang'].map((cat) => ({ cat, list: items.filter((i) => i.category === cat) }))

  return (
    <div>
      <div className="overflow-x-auto">
        <table className="w-full text-left text-sm">
          <thead className="border-b text-slate-500">
            <tr>
              <th className="w-8 py-2 pr-2">#</th>
              <th className="min-w-48 py-2 pr-2">Barang</th>
              <th className="w-20 py-2 pr-2">Satuan</th>
              {extraColumns.map((c, i) => (
                <th key={i} className={`py-2 pr-2 ${c.className || ''}`}>
                  {c.label}
                </th>
              ))}
              <th className="w-32 py-2 pr-2">{qtyLabel}</th>
              {showNote && <th className="py-2 pr-2">Catatan</th>}
              {editable && <th className="w-8" />}
            </tr>
          </thead>
          <tbody>
            {rows.map((r, i) => {
              const item = byId[r.item_id]
              return (
                <tr key={r.key} className="border-b align-top last:border-0">
                  <td className="py-2 pr-2 text-slate-400">{i + 1}</td>
                  <td className="py-2 pr-2">
                    {editable ? (
                      <select
                        value={r.item_id}
                        onChange={(e) => update(r.key, { item_id: e.target.value ? Number(e.target.value) : '' })}
                        className="w-full rounded border border-slate-300 px-2 py-1.5"
                      >
                        <option value="">— Pilih barang —</option>
                        {groups.map((g) =>
                          g.list.length ? (
                            <optgroup key={g.cat} label={g.cat === 'bahan' ? 'Bahan' : 'Barang'}>
                              {g.list.map((it) => (
                                <option key={it.id} value={it.id} disabled={used.has(it.id) && Number(r.item_id) !== it.id}>
                                  {it.name}
                                </option>
                              ))}
                            </optgroup>
                          ) : null,
                        )}
                      </select>
                    ) : (
                      <span className="font-medium text-slate-800">{r.name || item?.name}</span>
                    )}
                    {err(i, 'item_id') && <p className="mt-1 text-xs text-red-600">{err(i, 'item_id')}</p>}
                  </td>
                  <td className="py-2 pr-2 text-slate-500">{r.unit || item?.unit || '-'}</td>
                  {extraColumns.map((c, ci) => (
                    <td key={ci} className={`py-2 pr-2 ${c.className || ''}`}>
                      {c.render(r, i, item)}
                    </td>
                  ))}
                  <td className="py-2 pr-2">
                    {editable ? (
                      <input
                        type="number"
                        inputMode="decimal"
                        min="0"
                        step="any"
                        value={r[qtyField]}
                        onChange={(e) => update(r.key, { [qtyField]: e.target.value })}
                        className="w-full rounded border border-slate-300 px-2 py-1.5"
                      />
                    ) : (
                      <span className="font-semibold">{formatQty(r[qtyField])}</span>
                    )}
                    {err(i, qtyField) && <p className="mt-1 text-xs text-red-600">{err(i, qtyField)}</p>}
                  </td>
                  {showNote && (
                    <td className="py-2 pr-2">
                      {editable ? (
                        <input
                          value={r.note || ''}
                          maxLength={255}
                          onChange={(e) => update(r.key, { note: e.target.value })}
                          className="w-full rounded border border-slate-300 px-2 py-1.5"
                        />
                      ) : (
                        <span className="text-slate-600">{r.note || '-'}</span>
                      )}
                    </td>
                  )}
                  {editable && (
                    <td className="py-2 text-right">
                      <button
                        type="button"
                        onClick={() => remove(r.key)}
                        title="Hapus baris"
                        className="px-1 text-lg leading-none text-red-500 hover:text-red-700"
                      >
                        ×
                      </button>
                    </td>
                  )}
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
      {errors.items && <p className="mt-2 text-sm text-red-600">{errors.items[0]}</p>}
      {editable && (
        <button
          type="button"
          onClick={() => setRows((rs) => [...rs, newLine()])}
          className="mt-3 text-sm font-medium text-blue-600 hover:underline"
        >
          + Tambah baris
        </button>
      )}
    </div>
  )
}
