# Publish API (Cloudflare Worker)

Server kecil yang membuat tombol **Publish** di `/admin/` langsung meng-commit ke repo ini,
tanpa token GitHub di browser. Admin cukup login dengan email & password.

## Setup (sekali, ±10 menit, gratis)

1. **Buat token GitHub untuk server** — github.com/settings/personal-access-tokens/new
   - Repository access: *Only select repositories* → `liswan-dev.github.io`
   - Permissions → Contents: **Read and write**
   - Salin tokennya (dipakai di langkah 3, jangan dikirim ke mana pun)
2. **Buat Worker** — dash.cloudflare.com → *Workers & Pages* → *Create* → *Create Worker*
   - Nama: `liswan-publish` → *Deploy*
   - *Edit code* → hapus isi bawaan → tempel isi `publish-worker.js` → *Deploy*
3. **Isi pengaturan** — Worker → *Settings* → *Variables and Secrets* → *Add*:

   | Nama | Tipe | Isi |
   |---|---|---|
   | `GITHUB_TOKEN` | Secret | token dari langkah 1 |
   | `ADMIN_EMAIL` | Text | email untuk login admin |
   | `ADMIN_PASSWORD` | Secret | password login admin (minimal 12 karakter) |
   | `SESSION_SECRET` | Secret | teks acak panjang, mis. 40 huruf/angka bebas |
   | `ADMIN_NAME` | Text | opsional, mis. `Liswan Susanto` |

   Klik *Deploy* / *Save* setelah menambah semuanya.
4. **Cek** — buka `https://liswan-publish.<subdomain>.workers.dev/ping` → harus tampil `{"ok":true}`
5. **Sambungkan ke situs** — isi alamat Worker di `assets/js/publish-config.js`:
   ```js
   window.PUBLISH_API = 'https://liswan-publish.<subdomain>.workers.dev';
   ```
   lalu commit & push.

Setelah aktif, login `/admin/` memakai `ADMIN_EMAIL` + `ADMIN_PASSWORD` (akun demo tidak bisa
masuk lagi). Sesi berlaku 12 jam. Ganti password = ubah `ADMIN_PASSWORD` di Cloudflare.

## Keamanan

- Token GitHub hanya tersimpan di Cloudflare, tidak pernah dikirim ke browser.
- Worker hanya bisa menulis `data/*.json` dan `uploads/*` — tidak bisa mengubah kode situs.
- Hanya menerima permintaan dari liswan.dev (dan localhost untuk pengembangan).
- Login yang salah diperlambat untuk mencegah tebak-tebakan password.
