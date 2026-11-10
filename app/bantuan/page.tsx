import Link from "next/link";
import { PageHeader, Card } from "../components/ui";

function Item({ judul, children }: { judul: string; children: React.ReactNode }) {
  return (
    <section>
      <h3 className="font-bold text-ink">{judul}</h3>
      <div className="mt-1 space-y-1 text-sm text-muted">{children}</div>
    </section>
  );
}

export default function BantuanPage() {
  return (
    <div className="mx-auto max-w-2xl space-y-5">
      <PageHeader title="Bantuan" sub="Panduan singkat nasabah & teller loket." />
      <Card>
        <div className="space-y-5">
          <Item judul="Alur teller di loket">
            <p>
              <strong>Setoran / penarikan:</strong> buka Jurnal → tempel kartu RFID (saldo muncul otomatis) → isi
              jumlah → Simpan → nota keluar. Cek di Histori Periode (terbaru di atas) atau tekan Refresh bila belum
              muncul.
            </p>
            <p>
              <strong>Pinjaman & angsuran:</strong> cairkan di Pinjaman (kode Pxxx), bayar cicilan di Angsuran —
              jumlah bayar sama dengan sisa berarti lunas dan akan diminta konfirmasi.
            </p>
            <p>
              <strong>Kantin:</strong> buat QR di Merchant → di halaman Bayar scan QR lalu tempel kartu siswa → Bayar.
              Satu QR hanya berlaku 5 menit dan tidak bisa dipakai 2x.
            </p>
          </Item>
          <Item judul="1. Masuk (login)">
            <p>
              Buka{" "}
              <Link href="/login" className="font-semibold text-brand-600 hover:underline">
                Masuk
              </Link>
              , isi username + password, klik <strong>Masuk</strong>. Sesi berlaku 7 hari; bila habis, login ulang.
            </p>
          </Item>
          <Item judul="2. Daftar akun baru">
            <p>
              Khusus yang sudah punya rekening (kode Hxxx/Pxxx): buka{" "}
              <Link href="/register" className="font-semibold text-brand-600 hover:underline">
                Daftar
              </Link>
              , isi username, password (min 6), dan kode rekening. Akun <strong>belum aktif</strong> sampai diverifikasi
              teller/admin di loket.
            </p>
          </Item>
          <Item judul="3. Menu yang tersedia">
            <p>
              <strong>Riwayat Saya</strong> — mutasi + saldo rekening sendiri, bisa filter tanggal dan unduh CSV/XLSX.
            </p>
            <p>
              <strong>Daftar Saldo</strong> — saldo per tipe rekening (TABUNGAN / PIUTANG).
            </p>
          </Item>
          <Item judul="4. Lupa / ubah password">
            <p>
              Sudah login? Ganti sendiri di{" "}
              <Link href="/ubah-password" className="font-semibold text-brand-600 hover:underline">
                Ubah Password
              </Link>
              . Belum bisa login? Datang ke loket — admin akan meresetkan password Anda.
            </p>
          </Item>
          <Item judul="5. Keluar (logout)">
            <p>Di laptop: klik nama pengguna di bawah sidebar → Keluar. Di HP: menu Akun di navigasi bawah.</p>
          </Item>
          <Item judul="Pertanyaan umum">
            <p>
              <strong>“Akun belum ditautkan ke rekening”</strong> — akun belum punya kode Hxxx/Pxxx. Minta teller
              menautkannya.
            </p>
            <p>
              <strong>“Akun dinonaktifkan”</strong> — hubungi admin untuk mengaktifkan kembali.
            </p>
            <p>
              <strong>“Akses ditolak”</strong> di halaman tertentu — halaman itu khusus petugas, abaikan dan gunakan 3
              menu di atas.
            </p>
          </Item>
        </div>
      </Card>
    </div>
  );
}
