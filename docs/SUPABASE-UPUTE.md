# Supabase — upute za postavljanje (Etapa 2/3)

Ovo je temelj za stvarne oglase, korisničke račune i fotografije.
Struktura baze prati glavni projektni plan (odjeljak 7) i uključuje:
PostGIS geografsku pretragu, sve statuse oglasa, promociju "besplatni prvi
mjesec", naplatu, prijave prijevara i administratorske ovlasti.

## Što trebaš napraviti (10–15 minuta)

1. Otvori https://supabase.com i registriraj se (može Google račun).
2. Klikni **New project**:
   - Name: `skillona-globe`
   - Database password: generiraj i **spremi na sigurno**
   - Region: `eu-central-1 (Frankfurt)` — najbliže Hrvatskoj
3. Kad se projekt kreira, idi na **SQL Editor** (lijevi izbornik).
4. Otvori datoteku `supabase/migrations/0001_init_schema.sql` iz ovog
   repozitorija, kopiraj cijeli sadržaj u SQL Editor i klikni **Run**.
   - Mora završiti sa "Success. No rows returned".
5. Idi na **Project Settings → API** i zapiši dvije vrijednosti:
   - `Project URL`
   - `anon public` ključ
   (Ove dvije vrijednosti su javne i sigurne za frontend. **Nikad ne dijeli
   `service_role` ključ** — ni sa mnom u chatu, ni u kodu.)
6. Idi na **Storage** i kreiraj bucket `listing-photos` (Public bucket: ON).

## Što dobivaš ovom shemom

- **profiles** — automatski se kreira profil pri registraciji korisnika
  (privatnik / agencija / developer / admin)
- **listings** — svi podaci oglasa iz plana + geografska lokacija (PostGIS)
- **listings_in_bbox()** — funkcija koja vraća samo oglase u vidljivom
  dijelu globusa (nikad se ne učitava cijeli svijet odjednom)
- **listing_counts_by_country()** — brojevi za klastere ("Hrvatska — 184")
- **payments** — spremno za Stripe (testni način)
- **promotion_start / promotion_end** — evidencija besplatnog perioda
- **Row Level Security** — korisnik može mijenjati samo svoje oglase;
  administratorske funkcije samo za admin račun

## Kako postati admin

Nakon što se registriraš u aplikaciji, u SQL Editoru pokreni:

```sql
update public.profiles set account_type = 'admin'
where id = (select id from auth.users where email = 'TVOJ-EMAIL');
```

## Sljedeći korak nakon ovoga

Kad mi javiš `Project URL` i `anon` ključ, spajam prototip globusa na
stvarnu bazu: registracija, objava oglasa s markerom na globusu i
fotografije umjesto localStorage verzije.
