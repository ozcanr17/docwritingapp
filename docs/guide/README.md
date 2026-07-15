# DocSys kılavuzunu güncelleme

Kılavuzun düzenlenebilir ana kaynağı `DOCSYS-UCTAN-UCA-KILAVUZ.md` dosyasıdır. İçeriği güncelledikten sonra DOCX'i yeniden üretin:

```bash
python3 docs/guide/build_guide.py
```

Script `python-docx` ve Pillow gerektirir; çıktı `output/docx/` altına yazılır. PDF için LibreOffice ile dönüştürün:

```bash
mkdir -p output/pdf
soffice --headless --convert-to pdf --outdir output/pdf \
  output/docx/DocSys-Uctan-Uca-Mimari-Isletim-Kullanim-Kilavuzu.docx
```

İçerik uzunluğu değişirse `build_guide.py` içindeki statik içindekiler sayfa numaralarını son render sonucuna göre güncelleyin. Teslimden önce DOCX'i sayfa PNG'lerine render ederek bütün sayfaları görsel olarak kontrol edin ve erişilebilirlik denetimini yeniden çalıştırın.
