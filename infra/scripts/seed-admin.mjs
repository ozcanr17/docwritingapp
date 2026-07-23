const API = process.env.API_URL ?? "http://localhost:3001";
const APP = process.env.APP_BASE_URL ?? "http://localhost:5173";
const EMAIL = process.env.ADMIN_EMAIL ?? "admin@docsys.local";
const PASSWORD = process.env.ADMIN_PASSWORD ?? "Admin1234!";
const NAME = process.env.ADMIN_NAME ?? "DocSys Admin";

async function call(path, options = {}, cookie) {
  const res = await fetch(API + path, {
    headers: {
      ...(options.body ? { "Content-Type": "application/json" } : {}),
      ...(cookie ? { cookie } : {}),
    },
    ...options,
  });
  const text = await res.text();
  const setCookie = res.headers.get("set-cookie");
  return { status: res.status, body: text ? JSON.parse(text) : null, cookie: setCookie };
}

async function waitForApi() {
  for (let attempt = 0; attempt < 60; attempt += 1) {
    try {
      const res = await fetch(API + "/health/live");
      if (res.ok) return;
    } catch {
      // not up yet
    }
    await new Promise((resolve) => setTimeout(resolve, 1000));
  }
  throw new Error("API did not become ready at " + API);
}

async function requiredCall(path, options, cookie) {
  const response = await call(path, options, cookie);
  if (response.status < 200 || response.status >= 300) throw new Error("request failed: " + path + " " + response.status + " " + JSON.stringify(response.body));
  return response.body;
}

async function ensureDocument(cookie, workspaceId, documents, title, documentType) {
  const existing = documents.find((document) => document.title === title && document.documentType === documentType);
  if (existing) return existing;
  return requiredCall("/workspaces/" + workspaceId + "/documents", { method: "POST", body: JSON.stringify({ title, documentType, folderId: null }) }, cookie);
}

async function createRow(cookie, documentId, payload) {
  return requiredCall("/documents/" + documentId + "/rows", { method: "POST", body: JSON.stringify(payload) }, cookie);
}

async function updateTestStep(cookie, step, action, expectedResult) {
  return requiredCall("/rows/" + step.id, { method: "PATCH", body: JSON.stringify({ expectedVersion: step.version, testStepDetail: { action, expectedResult } }) }, cookie);
}

async function updateRow(cookie, row, patch) {
  return requiredCall("/rows/" + row.id, { method: "PATCH", body: JSON.stringify({ expectedVersion: row.version, ...patch }) }, cookie);
}

async function ensureRow(cookie, documentId, rows, definition) {
  let row = rows.find((candidate) => candidate.rowType === definition.rowType && candidate.parentId === definition.parentId && candidate.title === definition.title);
  if (!row) {
    row = await createRow(cookie, documentId, {
      rowType: definition.rowType,
      title: definition.title,
      description: definition.description,
      parentId: definition.parentId,
    });
    rows.push(row);
  }
  return row;
}

async function ensureLink(cookie, sourceRowId, targetRowId) {
  const detail = await requiredCall("/rows/" + sourceRowId, {}, cookie);
  const exists = [...detail.outgoingLinks, ...detail.incomingLinks]
    .some((link) => link.sourceRowId === targetRowId || link.targetRowId === targetRowId);
  if (!exists) {
    await requiredCall("/rows/" + sourceRowId + "/links", {
      method: "POST",
      body: JSON.stringify({ targetRowId, linkType: "verifies" }),
    }, cookie);
  }
}

async function ensureDemoDataset(cookie, organizationId) {
  const workspaces = await requiredCall("/organizations/" + organizationId + "/workspaces", {}, cookie);
  const workspace = workspaces[0];
  if (!workspace) throw new Error("demo workspace not found");
  const tree = await requiredCall("/workspaces/" + workspace.id + "/tree", {}, cookie);
  const requirementDocument = await ensureDocument(cookie, workspace.id, tree.documents, "Akıllı Otopark Yönetim Sistemi - Sistem Gereksinimleri", "requirement");
  const testDocument = await ensureDocument(cookie, workspace.id, tree.documents, "Akıllı Otopark Yönetim Sistemi - Kabul Testleri", "test");
  let requirementDocumentState = await requiredCall("/documents/" + requirementDocument.id, {}, cookie);
  if (requirementDocumentState.requirementPrefix !== "OTO") {
    requirementDocumentState = await requiredCall("/documents/" + requirementDocument.id, { method: "PATCH", body: JSON.stringify({ expectedVersion: requirementDocumentState.version, requirementPrefix: "OTO" }) }, cookie);
  }
  let requirementRows = await requiredCall("/documents/" + requirementDocument.id + "/outline", {}, cookie);
  const requirementGroups = [
    {
      title: "1. Araç Girişi ve Kapı Kontrolü",
      requirements: [
        { key: "plate", title: "Sistem, giriş kamerasındaki araç plakasını gündüz ve gece koşullarında en geç 2 saniye içinde tanımalıdır.", priority: "high", rationale: "Giriş kuyruğunu azaltmak ve manuel operatör ihtiyacını sınırlamak." },
        { key: "subscriber", title: "Sistem, aktif aboneliği bulunan ve kara listede olmayan araçlar için bariyeri otomatik açmalıdır.", priority: "critical", rationale: "Yetkili abonelerin kesintisiz geçişini sağlamak." },
        { key: "ticket", title: "Abone olmayan araç için benzersiz otopark bileti oluşturulmalı ve giriş zamanı saniye hassasiyetinde kaydedilmelidir.", priority: "high", rationale: "Ücret hesaplamasının izlenebilir bir giriş kaydına dayanması." },
        { key: "full_block", title: "Kullanılabilir park yeri sayısı sıfır olduğunda sistem yeni araç girişine izin vermemelidir.", priority: "critical", rationale: "Fiziksel kapasitenin aşılmasını önlemek." },
        { key: "manual", title: "Yetkili operatör, gerekçe girerek bariyeri manuel açabilmeli ve işlem denetim kaydına yazılmalıdır.", priority: "medium", rationale: "Arıza ve acil durumlarda kontrollü müdahale imkânı." },
        { key: "entry_audit", title: "Her giriş denemesi; plaka, zaman, kapı, sonuç ve karar nedeni alanlarıyla değiştirilemez olay kaydına alınmalıdır.", priority: "high", rationale: "Güvenlik incelemeleri ve uyuşmazlık çözümü." },
      ],
    },
    {
      title: "2. Doluluk ve Sürücü Yönlendirme",
      requirements: [
        { key: "occupancy", title: "Bir araç giriş veya çıkış yaptığında kat ve tesis doluluk değerleri en geç 3 saniye içinde güncellenmelidir.", priority: "critical", rationale: "Yönlendirme ekranlarında güncel kapasite göstermek." },
        { key: "display", title: "Giriş ekranları her kat için kullanılabilir standart, engelli ve elektrikli araç yeri sayılarını ayrı göstermelidir.", priority: "high", rationale: "Sürücünün uygun bölgeye ilk seferde yönlendirilmesi." },
        { key: "accessible", title: "Engelli kullanıcı profiline tanımlı araçlar, uygun yer varsa en yakın erişilebilir park bölgesine yönlendirilmelidir.", priority: "high", rationale: "Erişilebilirlik gereksinimlerini karşılamak." },
        { key: "sensor_fault", title: "Bir park sensörü 60 saniyeden uzun süre veri göndermediğinde yer durumu 'bilinmiyor' yapılmalı ve operatöre alarm üretilmelidir.", priority: "high", rationale: "Hatalı doluluk bilgisinin karar mekanizmasını etkilemesini önlemek." },
        { key: "reconcile", title: "Sayaç ile sensör toplamı arasında fark oluştuğunda sistem otomatik uzlaştırma kaydı başlatmalıdır.", priority: "medium", rationale: "Doluluk verisinin operasyon boyunca tutarlı kalması." },
      ],
    },
    {
      title: "3. Ücretlendirme ve Ödeme",
      requirements: [
        { key: "fee", title: "Park ücreti; giriş zamanı, çıkış zamanı, tarife dönemi ve tanımlı ücretsiz süre kullanılarak hesaplanmalıdır.", priority: "critical", rationale: "Müşteriye doğru ve açıklanabilir ücret yansıtmak." },
        { key: "lost_ticket", title: "Kayıp bilet işleminde plaka geçmişi bulunamazsa yönetici onayıyla günlük üst sınır ücreti uygulanmalıdır.", priority: "high", rationale: "Gelir kaybını önlerken istisna işlemini denetim altında tutmak." },
        { key: "contactless", title: "Ödeme terminali temassız banka kartı ödemesini desteklemeli ve sonucu en geç 30 saniye içinde bildirmelidir.", priority: "high", rationale: "Yoğun saatlerde hızlı çıkış sağlamak." },
        { key: "receipt", title: "Başarılı ödeme sonrasında işlem numarası, KDV, tarife ve toplam tutarı içeren elektronik fiş oluşturulmalıdır.", priority: "medium", rationale: "Mali kayıt ve müşteri bilgilendirmesi." },
        { key: "payment_retry", title: "Ödeme sağlayıcısına erişilemediğinde işlem iki kez yeniden denenmeli, yine başarısızsa alternatif ödeme yönlendirmesi gösterilmelidir.", priority: "high", rationale: "Geçici ağ sorunlarında çıkış kuyruğunu yönetmek." },
      ],
    },
    {
      title: "4. Operasyon, Güvenlik ve Veri Koruma",
      requirements: [
        { key: "fire", title: "Yangın alarmı aktif olduğunda tüm çıkış bariyerleri 5 saniye içinde güvenli açık konuma geçmelidir.", priority: "critical", rationale: "Acil tahliyede araç çıkışını engellememek." },
        { key: "offline", title: "Merkez bağlantısı kesildiğinde saha denetleyicisi en az 4 saat çevrimdışı çalışabilmelidir.", priority: "critical", rationale: "WAN kesintisinde temel otopark işletimini sürdürmek." },
        { key: "sync", title: "Bağlantı yeniden kurulduğunda çevrimdışı olaylar yinelenen kayıt oluşturmadan merkeze aktarılmalıdır.", priority: "high", rationale: "Kesinti sonrası veri bütünlüğünü korumak." },
        { key: "retention", title: "Plaka görüntüleri normal kullanıcılar için 30 gün sonunda otomatik silinmeli, yasal saklama işareti bulunan kayıtlar korunmalıdır.", priority: "high", rationale: "Kişisel veri saklama süresine ve hukuki yükümlülüklere uymak." },
        { key: "roles", title: "Tarife değiştirme, manuel bariyer açma ve kayıt dışa aktarma işlemleri rol tabanlı yetkilendirmeye tabi olmalıdır.", priority: "high", rationale: "Kritik operasyonlara yalnızca yetkili personelin erişmesi." },
        { key: "availability", title: "Yerel saha hizmetlerinin aylık erişilebilirliği planlı bakım hariç yüzde 99,5 değerinden düşük olmamalıdır.", priority: "medium", rationale: "Otopark operasyonunun hizmet seviyesi hedefini tanımlamak." },
      ],
    },
  ];
  const requirements = new Map();
  for (const group of requirementGroups) {
    const heading = await ensureRow(cookie, requirementDocument.id, requirementRows, { rowType: "heading", title: group.title, parentId: null });
    for (const definition of group.requirements) {
      let requirement = await ensureRow(cookie, requirementDocument.id, requirementRows, {
        rowType: "requirement",
        title: definition.title,
        description: definition.rationale,
        parentId: heading.id,
      });
      const detail = await requiredCall("/rows/" + requirement.id, {}, cookie);
      if (detail.requirementDetail?.status !== "approved" || detail.requirementDetail?.priority !== definition.priority || detail.requirementDetail?.rationale !== definition.rationale) {
        requirement = await updateRow(cookie, detail, { requirementDetail: { status: "approved", priority: definition.priority, rationale: definition.rationale } });
      }
      requirements.set(definition.key, { ...requirement, requirementNo: detail.requirementDetail?.requirementNo });
    }
  }
  const testSuites = [
    {
      title: "Giriş ve Kapasite Kabul Testleri",
      cases: [
        { name: "KT-001 Abone araç plaka tanıma ile giriş", priority: "critical", tags: ["giriş", "LPR", "pozitif"], requirements: ["plate", "subscriber", "entry_audit"], steps: [
          ["Aktif aboneliğe bağlı 34 ABC 123 plakalı aracı giriş kamerasının görüş alanına getirin.", "Plaka en geç 2 saniye içinde 34 ABC 123 olarak tanınır.", ["plate"]],
          ["Abonelik ve kara liste sorgusunun tamamlanmasını bekleyin.", "Abonelik aktif, araç izinli olarak değerlendirilir.", ["subscriber"]],
          ["Giriş bariyerini gözlemleyin.", "Bariyer operatör müdahalesi olmadan açılır.", ["subscriber"]],
          ["Araç geçtikten sonra olay kaydını açın.", "Plaka, kapı, zaman, başarılı sonuç ve karar nedeni kayıtta bulunur.", ["entry_audit"]],
          ["Aynı araçla ikinci giriş denemesi yapın.", "Mükerrer giriş engellenir ve reddetme nedeni olay kaydına eklenir.", ["subscriber", "entry_audit"]],
        ]},
        { name: "KT-002 Otopark doluyken araç kabulünün engellenmesi", priority: "critical", tags: ["kapasite", "negatif"], requirements: ["full_block", "occupancy", "display", "entry_audit"], steps: [
          ["Test ortamında kullanılabilir standart yer sayısını 1 olarak ayarlayın.", "Giriş ekranında 1 kullanılabilir standart yer gösterilir.", ["display"]],
          ["Bir test aracının girişini tamamlayın.", "Doluluk değeri en geç 3 saniyede güncellenir ve boş yer sayısı 0 olur.", ["occupancy", "display"]],
          ["İkinci aracı giriş kapısına getirin.", "Bariyer kapalı kalır ve 'Otopark dolu' yönlendirmesi gösterilir.", ["full_block"]],
          ["Reddedilen girişin olay kaydını kontrol edin.", "Karar nedeni kapasite dolu olarak kaydedilmiştir.", ["entry_audit", "full_block"]],
        ]},
        { name: "KT-003 Engelli sürücünün uygun bölgeye yönlendirilmesi", priority: "high", tags: ["erişilebilirlik", "yönlendirme"], requirements: ["accessible", "display", "occupancy"], steps: [
          ["Engelli kullanıcı profiline bağlı aracı girişe getirin.", "Araç profili erişilebilir park yetkisiyle tanınır.", ["accessible"]],
          ["Kat ekranındaki yer türü sayılarını kontrol edin.", "Standart, engelli ve elektrikli araç yerleri ayrı gösterilir.", ["display"]],
          ["Sunulan rotayı takip edin ve aracı ayrılan yere park edin.", "En yakın uygun erişilebilir bölge seçilir; doluluk 3 saniye içinde güncellenir.", ["accessible", "occupancy"]],
        ]},
      ],
    },
    {
      title: "Ödeme ve Çıkış Kabul Testleri",
      cases: [
        { name: "KT-004 Kayıp bilet ve yönetici onaylı üst sınır ücreti", priority: "high", tags: ["ödeme", "istisna"], requirements: ["fee", "lost_ticket", "roles", "entry_audit"], steps: [
          ["Plaka geçmişi olmayan bir araç için kayıp bilet işlemi başlatın.", "Sistem araç geçmişinin bulunamadığını bildirir.", ["lost_ticket"]],
          ["Operatör hesabıyla günlük üst sınır ücretini uygulamayı deneyin.", "Yetki yetersiz uyarısı verilir ve işlem tamamlanmaz.", ["roles"]],
          ["Yönetici hesabıyla aynı işlemi açın ve gerekçe girin.", "Onay ekranı günlük üst sınır tutarını ve gerekçeyi gösterir.", ["lost_ticket", "roles"]],
          ["İşlemi onaylayın.", "Ücret tarife üst sınırına göre hesaplanır.", ["fee", "lost_ticket"]],
          ["Ödemeyi tamamlayın.", "Çıkış izni oluşturulur ve işlem numarası üretilir.", ["fee"]],
          ["Denetim kaydını inceleyin.", "Yönetici, gerekçe, tutar ve zaman bilgileri kayıtlıdır.", ["entry_audit", "roles"]],
        ]},
        { name: "KT-005 Temassız ödeme ve elektronik fiş", priority: "high", tags: ["ödeme", "entegrasyon", "pozitif"], requirements: ["fee", "contactless", "receipt"], steps: [
          ["90 dakika park etmiş araç için ödeme ekranını açın.", "Ücret giriş/çıkış zamanı, ücretsiz süre ve aktif tarifeye göre gösterilir.", ["fee"]],
          ["Temassız banka kartını terminale okutun.", "Terminal kartı algılar ve ödeme isteğini başlatır.", ["contactless"]],
          ["Banka simülatöründen işlemi onaylayın.", "Başarılı sonuç en geç 30 saniyede uygulamaya ulaşır.", ["contactless"]],
          ["Elektronik fişi açın.", "Fişte işlem numarası, KDV, tarife ve toplam tutar bulunur.", ["receipt"]],
          ["Araçla çıkış bariyerine ilerleyin.", "Ödenmiş bilet doğrulanır ve bariyer açılır.", ["fee", "contactless"]],
        ]},
        { name: "KT-006 Ödeme sağlayıcısı kesintisinde yeniden deneme", priority: "high", tags: ["ödeme", "dayanıklılık"], requirements: ["payment_retry", "contactless"], steps: [
          ["Ödeme sağlayıcısı bağlantısını kesip temassız ödeme başlatın.", "İlk bağlantı hatası kullanıcıya teknik ayrıntı göstermeden ele alınır.", ["payment_retry"]],
          ["Otomatik yeniden denemeleri izleyin.", "Sistem işlemi tam iki kez yeniden dener.", ["payment_retry"]],
          ["Bağlantıyı kapalı tutun.", "Alternatif ödeme yönlendirmesi gösterilir ve mükerrer tahsilat oluşmaz.", ["payment_retry", "contactless"]],
        ]},
      ],
    },
    {
      title: "Süreklilik, Güvenlik ve Veri Koruma Testleri",
      cases: [
        { name: "KT-007 Yangın alarmında güvenli çıkış", priority: "critical", tags: ["acil durum", "emniyet"], requirements: ["fire", "offline", "entry_audit"], steps: [
          ["Tüm çıkış bariyerlerini normal kapalı işletim durumuna alın.", "Bariyerler komut almaya hazır kapalı durumdadır.", ["fire"]],
          ["Merkez bağlantısını kesin.", "Saha denetleyicisi yerel işletime devam eder.", ["offline"]],
          ["Yangın panelinden doğrulanmış alarm sinyali gönderin.", "Alarm olayı saha denetleyicisi tarafından alınır.", ["fire", "offline"]],
          ["Kronometreyi başlatıp çıkış bariyerlerini gözlemleyin.", "Tüm çıkış bariyerleri 5 saniye içinde güvenli açık konuma geçer.", ["fire"]],
          ["Operatörün bariyerleri kapatma girişimini deneyin.", "Aktif alarm boyunca kapatma komutu reddedilir.", ["fire", "roles"]],
          ["Alarmı sıfırlayın.", "Bariyerler otomatik kapanmaz; operatör onayı beklenir.", ["fire", "roles"]],
          ["Olay geçmişini kontrol edin.", "Alarm, açılma süreleri ve operatör işlemleri denetim kaydında yer alır.", ["entry_audit"]],
        ]},
        { name: "KT-008 Çevrimdışı olayların merkeze tekilleştirilerek aktarılması", priority: "critical", tags: ["çevrimdışı", "senkronizasyon"], requirements: ["offline", "sync", "occupancy", "entry_audit"], steps: [
          ["Merkez bağlantısını kesin ve iki giriş ile bir çıkış işlemi gerçekleştirin.", "İşlemler yerelde tamamlanır; olaylar sıra numarasıyla kuyrukta tutulur.", ["offline", "entry_audit"]],
          ["Saha hizmetini yeniden başlatıp çevrimdışı süreyi 4 saat simüle edin.", "Kuyruk ve yerel doluluk bilgisi kaybolmadan korunur.", ["offline", "occupancy"]],
          ["Merkez bağlantısını yeniden kurun.", "Bekleyen olaylar zaman sırasıyla merkeze aktarılır.", ["sync"]],
          ["Aynı senkronizasyon paketini tekrar gönderin.", "Yinelenen olay oluşmaz; merkez ve saha doluluk değerleri eşitlenir.", ["sync", "occupancy"]],
        ]},
        { name: "KT-009 Plaka görüntüsü saklama süresi", priority: "high", tags: ["KVKK", "saklama"], requirements: ["retention", "roles"], steps: [
          ["31 gün önce oluşturulmuş normal ve yasal saklama işaretli iki plaka görüntüsü hazırlayın.", "Her iki kayıt da saklama görevi öncesinde erişilebilir durumdadır.", ["retention"]],
          ["Günlük saklama görevini çalıştırıp sonuçları kontrol edin.", "Normal görüntü silinir; yasal saklama işaretli görüntü korunur ve dışa aktarma yalnız yetkili role açıktır.", ["retention", "roles"]],
        ]},
      ],
    },
  ];
  let testRows = await requiredCall("/documents/" + testDocument.id + "/outline", {}, cookie);
  for (const suite of testSuites) {
    const suiteHeading = await ensureRow(cookie, testDocument.id, testRows, { rowType: "heading", title: suite.title, parentId: null });
    for (const definition of suite.cases) {
      let testCase = await ensureRow(cookie, testDocument.id, testRows, {
        rowType: "test_case",
        title: definition.name,
        description: "Gerçek saha işletimini temsil eden uçtan uca kabul testi.",
        parentId: suiteHeading.id,
      });
      let detail = await requiredCall("/rows/" + testCase.id, {}, cookie);
      if (detail.testCaseDetail?.status !== "ready" || detail.testCaseDetail?.priority !== definition.priority) {
        testCase = await updateRow(cookie, detail, { testCaseDetail: { status: "ready", priority: definition.priority, tags: definition.tags } });
        detail = await requiredCall("/rows/" + testCase.id, {}, cookie);
      }
      for (const requirementKey of definition.requirements) {
        await ensureLink(cookie, testCase.id, requirements.get(requirementKey).id);
      }
      let steps = testRows.filter((row) => row.parentId === testCase.id && row.rowType === "test_step");
      while (steps.length < definition.steps.length) {
        const created = await createRow(cookie, testDocument.id, { rowType: "test_step", title: "", parentId: testCase.id });
        steps.push(created);
        testRows.push(created);
      }
      for (let index = 0; index < definition.steps.length; index += 1) {
        const [action, expectedResult, requirementKeys] = definition.steps[index];
        let step = await requiredCall("/rows/" + steps[index].id, {}, cookie);
        if (step.testStepDetail?.action !== action || step.testStepDetail?.expectedResult !== expectedResult || step.testStepDetail?.stepNumber !== index + 1) {
          step = await updateRow(cookie, step, { testStepDetail: { stepNumber: index + 1, action, expectedResult } });
        }
        for (const requirementKey of requirementKeys) {
          await ensureLink(cookie, step.id, requirements.get(requirementKey).id);
        }
      }
    }
  }
}

async function main() {
  await waitForApi();

  let auth = await call("/auth/register", {
    method: "POST",
    body: JSON.stringify({ email: EMAIL, displayName: NAME, password: PASSWORD }),
  });
  if (auth.status === 409) {
    auth = await call("/auth/login", {
      method: "POST",
      body: JSON.stringify({ email: EMAIL, password: PASSWORD }),
    });
  }
  if (auth.status !== 201 || !auth.cookie) {
    throw new Error("auth failed: " + auth.status + " " + JSON.stringify(auth.body));
  }
  const cookie = auth.cookie.split(";")[0];

  const orgs = await call("/organizations", {}, cookie);
  let organizationId = Array.isArray(orgs.body) ? orgs.body[0]?.id : null;
  if (!organizationId) {
    const org = await call(
      "/organizations",
      { method: "POST", body: JSON.stringify({ name: "DocSys Demo", slug: "docsys-demo" }) },
      cookie,
    );
    organizationId = org.body.id;
    await call(
      "/organizations/" + org.body.id + "/workspaces",
      { method: "POST", body: JSON.stringify({ name: "Ana Alan", slug: "main" }) },
      cookie,
    );
  }

  const demoUsers = [
    { email: "editor@docsys.local", displayName: "Cem Kaya - Gereksinim Mühendisi", roleKey: "editor" },
    { email: "reviewer@docsys.local", displayName: "Selin Demir - Test Lideri", roleKey: "reviewer" },
    { email: "viewer@docsys.local", displayName: "Mert Yılmaz - Proje Gözlemcisi", roleKey: "viewer" },
  ];
  const demoPassword = process.env.DEMO_PASSWORD ?? "Test12345!";
  const existingMembers = await requiredCall("/organizations/" + organizationId + "/members", {}, cookie);
  for (const demo of demoUsers) {
    if (existingMembers.some((member) => member.email === demo.email)) continue;
    await requiredCall("/organizations/" + organizationId + "/users", {
      method: "POST",
      body: JSON.stringify({ email: demo.email, displayName: demo.displayName, password: demoPassword, roleKey: demo.roleKey }),
    }, cookie);
  }

  await ensureDemoDataset(cookie, organizationId);

  console.log("");
  console.log("========================================");
  console.log(" DocSys admin account is ready");
  console.log("========================================");
  console.log("  URL:      " + APP);
  console.log("  Email:    " + EMAIL);
  console.log("  Password: " + PASSWORD);
  console.log("  Demo users: editor, reviewer, viewer");
  console.log("  Demo password: " + demoPassword);
  console.log("========================================");
  console.log("");
}

main().catch((error) => {
  console.error("SEED_FAILED:", error.message);
  process.exit(1);
});
