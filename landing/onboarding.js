/* RBR — Build Your Retreat App onboarding questionnaire.
   Single source of truth: OB (data model). Steps are pre-authored DOM
   sections (data-step) shown/hidden in order; STEP_ORDER + isStepVisible()
   determine the active conditional path and drive progress calculation.
   No backend exists yet — draft state persists to localStorage on this
   device only, and final "submission" produces a structured JSON payload
   the visitor can download; nothing is transmitted anywhere. */
(function(){

  var STEP_ORDER = ['intro','plan','retreat','brand','style','modules','schedule','teachers','meals','facilities','resources','media','info','contact','review','success'];
  var NON_PROGRESS_STEPS = { intro:true, success:true };

  var MODULES = [
    { key:'calendar',  name:'Retreat Calendar',            desc:'Multi day journey view',                    badges:['recommended','included'] },
    { key:'schedule',  name:'Daily Schedule',               desc:'Detailed timeline and session locations',   badges:['included'] },
    { key:'teachers',  name:'Teachers & Facilitators',      desc:'Profiles and bios',                         badges:['included'] },
    { key:'meals',     name:'Meals & Dining',                desc:'Menus and dietary tags',                    badges:['included'] },
    { key:'facilities',name:'Facilities & Spaces',          desc:'Sauna, pool, yoga spaces and more',         badges:[] },
    { key:'gallery',   name:'Gallery',                       desc:'Photos from the retreat',                   badges:[] },
    { key:'resources', name:'Resources',                     desc:'PDFs, worksheets, journal prompts',         badges:[] },
    { key:'audio',     name:'Audio & Meditations Vault',    desc:'Guided meditations and sound journeys',     badges:['harmony'], harmonyOnly:true },
    { key:'reviews',   name:'Reviews / Share Your Experience', desc:'Guests can share reflections',           badges:[] },
    { key:'shop',      name:'Shop',                          desc:'Retreat merchandise or add ons',            badges:[] }
  ];
  var DEFAULT_MODULES = ['calendar','schedule','teachers','meals'];

  var SPECIALTIES = ['Yoga','Meditation','Breathwork','Sound Healing','Somatics','Nutrition','Coaching','Other'];

  function freshOB(){
    return {
      plan: null,
      project: { retreatName:'', retreatType:'', startDate:'', endDate:'', location:'', country:'', shortDescription:'', website:'', instagram:'' },
      brand: { logoDataUrl:null, logoName:null, primaryColor:'#1B2E24', secondaryColor:'#8A9A86', brandGuideName:null, website:'' },
      visualStyle: [],
      modules: DEFAULT_MODULES.slice(),
      schedule: { importMethod:null, fileName:null, link:'', hasThemedDays:null, dayThemes:[], visibility:'both' },
      teachers: [],
      meals: { times:[], changesDaily:null, storageMethod:'', fileName:'' },
      facilities: [],
      resources: [],
      media: { heroName:null, galleryFiles:[], link:'' },
      generalInfo: { wifiName:'', wifiPassword:'', checkIn:'', checkOut:'', receptionHours:'', emergencyContact:'', whatsapp:'', email:'', mapsLink:'', instagram:'', transportation:'', whatToBring:'', laundry:'', quietHours:'', smokingPolicy:'', houseRules:'' },
      contact: { fullName:'', email:'', phone:'' }
    };
  }

  var OB = freshOB();
  var currentIndex = 0;
  var saveTimer = null;
  var uid = 0;
  function nextUid(){ return 'ob' + (++uid); }

  var STORAGE_KEY = 'rbr_onboarding_draft_v1';

  function isStepVisible(id){
    if (id === 'schedule')   return OB.modules.indexOf('calendar') !== -1 || OB.modules.indexOf('schedule') !== -1;
    if (id === 'teachers')   return OB.modules.indexOf('teachers') !== -1;
    if (id === 'meals')      return OB.modules.indexOf('meals') !== -1;
    if (id === 'facilities') return OB.modules.indexOf('facilities') !== -1;
    if (id === 'resources')  return OB.modules.indexOf('resources') !== -1 || OB.modules.indexOf('audio') !== -1;
    return true;
  }

  function visiblePath(){ return STEP_ORDER.filter(isStepVisible); }

  var STEP_TITLES = {
    intro:'Welcome', plan:'Your RBR Plan', retreat:'Retreat Details', brand:'Brand',
    style:'Visual Style', modules:'Choose Your App Sections', schedule:'Schedule & Calendar',
    teachers:'Teachers & Facilitators', meals:'Meals & Dining', facilities:'Facilities & Spaces',
    resources:'Resources', media:'Media', info:'General Information', contact:'Your Details',
    review:'Review', success:'Complete'
  };

  var sections = {};
  STEP_ORDER.forEach(function(id){ sections[id] = document.querySelector('.ob-step[data-step="' + id + '"]'); });

  var backBtn = document.getElementById('obBack');
  var stepTitleEl = document.getElementById('obStepTitle');
  var progressBar = document.getElementById('obProgressBar');
  var timeLeftEl = document.getElementById('obTimeLeft');
  var saveStateEl = document.getElementById('obSaveState');

  function showStep(id){
    STEP_ORDER.forEach(function(s){ if (sections[s]) sections[s].classList.remove('active'); });
    if (sections[id]) sections[id].classList.add('active');
    currentIndex = STEP_ORDER.indexOf(id);

    var path = visiblePath();
    var countable = path.filter(function(s){ return !NON_PROGRESS_STEPS[s]; });
    var posInCountable = countable.indexOf(id);
    var pct = id === 'success' ? 100 : (posInCountable >= 0 ? Math.round((posInCountable / countable.length) * 100) : 0);
    progressBar.style.width = pct + '%';

    stepTitleEl.textContent = STEP_TITLES[id] || '';
    var remainingSteps = Math.max(0, countable.length - posInCountable);
    var mins = Math.max(1, Math.round(remainingSteps * 0.8));
    timeLeftEl.textContent = (id === 'intro' || id === 'success' || id === 'review') ? '' : ('About ' + mins + ' minute' + (mins === 1 ? '' : 's') + ' remaining');

    backBtn.disabled = (id === 'intro');
    window.scrollTo({ top: 0, behavior: 'auto' });
    if (id === 'review') renderSummary();
    renderPreview();
  }

  function goToStepIndexInPath(offset){
    var path = visiblePath();
    var curId = STEP_ORDER[currentIndex];
    var posInPath = path.indexOf(curId);
    var targetPos = posInPath + offset;
    if (targetPos < 0 || targetPos >= path.length) return;
    showStep(path[targetPos]);
  }

  function goNext(){ if (validateCurrentStep()) goToStepIndexInPath(1); }
  function goBack(){ goToStepIndexInPath(-1); }

  document.querySelectorAll('[data-next]').forEach(function(b){ b.addEventListener('click', goNext); });
  document.querySelectorAll('[data-back]').forEach(function(b){ b.addEventListener('click', goBack); });
  backBtn.addEventListener('click', goBack);

  /* ---------------- validation (only what's genuinely required) ---------------- */
  function setErr(fieldWrapId, hasError){
    var el = document.getElementById(fieldWrapId);
    if (el) el.classList.toggle('has-error', hasError);
  }
  function fieldWrap(inputEl){ return inputEl ? inputEl.closest('.ob-field') : null; }

  function validateCurrentStep(){
    var id = STEP_ORDER[currentIndex];
    if (id === 'plan'){
      return !!OB.plan;
    }
    if (id === 'retreat'){
      var ok = true;
      var name = document.getElementById('fRetreatName');
      var start = document.getElementById('fStartDate');
      var end = document.getElementById('fEndDate');
      var nameErr = name.value.trim().length === 0;
      var startErr = start.value.length === 0;
      var endErr = end.value.length === 0;
      if (fieldWrap(name)) fieldWrap(name).classList.toggle('has-error', nameErr);
      if (fieldWrap(start)) fieldWrap(start).classList.toggle('has-error', startErr);
      if (fieldWrap(end)) fieldWrap(end).classList.toggle('has-error', endErr);
      if (nameErr || startErr || endErr) ok = false;
      if (!ok){ (nameErr ? name : (startErr ? start : end)).focus(); }
      return ok;
    }
    if (id === 'contact'){
      var okc = true;
      var nm = document.getElementById('fYourName');
      var em = document.getElementById('fYourEmail');
      var ph = document.getElementById('fYourPhone');
      var nmErr = nm.value.trim().length === 0;
      var emErr = em.value.trim().length === 0 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(em.value.trim());
      var phErr = ph.value.trim().length === 0 || !/^\+?[0-9\s().-]{7,20}$/.test(ph.value.trim());
      if (fieldWrap(nm)) fieldWrap(nm).classList.toggle('has-error', nmErr);
      if (fieldWrap(em)) fieldWrap(em).classList.toggle('has-error', emErr);
      if (fieldWrap(ph)) fieldWrap(ph).classList.toggle('has-error', phErr);
      if (nmErr || emErr || phErr) okc = false;
      if (!okc){ (nmErr ? nm : (emErr ? em : ph)).focus(); }
      return okc;
    }
    return true;
  }

  /* ---------------- draft persistence (this device only) ---------------- */
  function scheduleSave(){
    if (saveTimer) clearTimeout(saveTimer);
    saveTimer = setTimeout(function(){
      try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(OB));
        saveStateEl.classList.add('show');
        setTimeout(function(){ saveStateEl.classList.remove('show'); }, 1600);
      } catch (err) { /* storage unavailable or full — draft simply won't persist */ }
    }, 500);
  }

  function loadDraft(){
    try {
      var raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return;
      var parsed = JSON.parse(raw);
      OB = Object.assign(freshOB(), parsed);
    } catch (err) { /* ignore corrupt draft */ }
  }

  /* ---------------- bind simple text/select fields directly to OB ---------------- */
  function bindText(id, obj, key, transform){
    var el = document.getElementById(id);
    if (!el) return;
    el.addEventListener('input', function(){
      obj[key] = transform ? transform(el.value) : el.value;
      scheduleSave();
      renderPreview();
    });
  }

  bindText('fRetreatName', OB.project, 'retreatName');
  bindText('fRetreatType', OB.project, 'retreatType');
  bindText('fStartDate', OB.project, 'startDate');
  bindText('fEndDate', OB.project, 'endDate');
  bindText('fLocation', OB.project, 'location');
  bindText('fCountry', OB.project, 'country');
  bindText('fShortDesc', OB.project, 'shortDescription');
  bindText('fWebsite', OB.project, 'website');
  bindText('fInstagram', OB.project, 'instagram');
  document.getElementById('fRetreatType').addEventListener('change', function(){ OB.project.retreatType = this.value; scheduleSave(); });

  bindText('fBrandWebsite', OB.brand, 'website');

  bindText('fScheduleLink', OB.schedule, 'link');
  bindText('fMediaLink', OB.media, 'link');

  ['wifiName:fWifiName','wifiPassword:fWifiPass','checkIn:fCheckIn','checkOut:fCheckOut',
   'receptionHours:fReceptionHours','emergencyContact:fEmergency','whatsapp:fWhatsapp',
   'email:fGeneralEmail','mapsLink:fMapsLink','instagram:fInfoInstagram','transportation:fTransportation',
   'whatToBring:fWhatToBring','laundry:fLaundry','quietHours:fQuietHours','smokingPolicy:fSmoking',
   'houseRules:fHouseRules'
  ].forEach(function(pair){
    var parts = pair.split(':');
    bindText(parts[1], OB.generalInfo, parts[0]);
  });

  bindText('fYourName', OB.contact, 'fullName');
  bindText('fYourEmail', OB.contact, 'email');
  bindText('fYourPhone', OB.contact, 'phone');

  document.getElementById('fMealStorage').addEventListener('change', function(){
    OB.meals.storageMethod = this.value;
    document.getElementById('obMealUploadWrap').style.display = (this.value === 'Upload PDF') ? '' : 'none';
    scheduleSave();
  });

  document.getElementById('fScheduleVisibility').addEventListener('change', function(){
    OB.schedule.visibility = this.value; scheduleSave();
  });

  /* ---------------- plan selection ---------------- */
  var planGrid = document.getElementById('obPlanGrid');
  planGrid.querySelectorAll('.ob-choicecard').forEach(function(card){
    card.addEventListener('click', function(){
      planGrid.querySelectorAll('.ob-choicecard').forEach(function(c){ c.classList.remove('selected'); });
      card.classList.add('selected');
      OB.plan = card.getAttribute('data-plan');
      document.getElementById('obPlanNext').disabled = false;
      renderModuleGrid();
      scheduleSave();
    });
  });

  /* ---------------- visual style (max 2) ---------------- */
  var styleGrid = document.getElementById('obStyleGrid');
  styleGrid.querySelectorAll('.ob-choicecard').forEach(function(card){
    card.addEventListener('click', function(){
      var key = card.getAttribute('data-style');
      var idx = OB.visualStyle.indexOf(key);
      if (idx !== -1){
        OB.visualStyle.splice(idx, 1);
        card.classList.remove('selected');
      } else {
        if (OB.visualStyle.length >= 2){
          var first = OB.visualStyle.shift();
          var firstCard = styleGrid.querySelector('[data-style="' + first + '"]');
          if (firstCard) firstCard.classList.remove('selected');
        }
        OB.visualStyle.push(key);
        card.classList.add('selected');
      }
      scheduleSave();
    });
  });

  /* ---------------- module grid (dynamic, plan-aware) ---------------- */
  var moduleGrid = document.getElementById('obModuleGrid');
  function renderModuleGrid(){
    moduleGrid.innerHTML = '';
    MODULES.forEach(function(mod){
      var locked = mod.harmonyOnly && OB.plan === 'singleRetreat';
      var selected = OB.modules.indexOf(mod.key) !== -1 && !locked;
      var card = document.createElement('button');
      card.type = 'button';
      card.className = 'ob-choicecard' + (selected ? ' selected' : '') + (locked ? ' disabled' : '');
      var badgesHtml = (mod.badges || []).map(function(b){
        var label = b === 'included' ? 'Included' : b === 'recommended' ? 'Recommended' : b === 'harmony' ? 'In Harmony' : b;
        return '<span class="badge ' + b + '">' + label + '</span>';
      }).join('');
      card.innerHTML = '<b>' + mod.name + '</b><span class="desc">' + mod.desc + '</span>' + badgesHtml + '<span class="check">' + (selected ? checkSvg() : '') + '</span>';
      if (locked){
        card.title = 'Available with Harmony';
      } else {
        card.addEventListener('click', function(){
          var i = OB.modules.indexOf(mod.key);
          if (i !== -1) OB.modules.splice(i, 1); else OB.modules.push(mod.key);
          renderModuleGrid();
          scheduleSave();
          renderPreview();
        });
      }
      moduleGrid.appendChild(card);
    });
  }
  function checkSvg(){ return '<svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3"><path d="M20 6L9 17l-5-5"/></svg>'; }
  renderModuleGrid();

  /* ---------------- color pickers ---------------- */
  function wireColor(colorInputId, hexInputId, swatchId, key){
    var colorInput = document.getElementById(colorInputId);
    var hexInput = document.getElementById(hexInputId);
    var swatch = document.getElementById(swatchId);
    function apply(val){
      OB.brand[key] = val;
      swatch.style.background = val;
      renderPreview();
      scheduleSave();
    }
    colorInput.addEventListener('input', function(){ hexInput.value = this.value.toUpperCase(); apply(this.value); });
    hexInput.addEventListener('input', function(){
      var v = this.value.trim();
      if (/^#[0-9A-Fa-f]{6}$/.test(v)){ colorInput.value = v; apply(v); }
    });
  }
  wireColor('fPrimaryColor', 'fPrimaryHex', 'obPrimarySwatch', 'primaryColor');
  wireColor('fSecondaryColor', 'fSecondaryHex', 'obSecondarySwatch', 'secondaryColor');

  /* ---------------- file uploads ---------------- */
  function readAsDataUrl(file, cb){
    var reader = new FileReader();
    reader.onload = function(){ cb(reader.result); };
    reader.readAsDataURL(file);
  }

  function wireSimpleUpload(zoneId, inputId, onFile){
    var zone = document.getElementById(zoneId);
    var input = document.getElementById(inputId);
    if (!zone || !input) return;
    zone.addEventListener('click', function(e){ if (e.target !== input) input.click(); });
    input.addEventListener('change', function(){
      if (input.files && input.files[0]) onFile(input.files[0]);
    });
  }

  wireSimpleUpload('obLogoUpload', 'fLogo', function(file){
    OB.brand.logoName = file.name;
    if (file.size < 600000){
      readAsDataUrl(file, function(dataUrl){
        OB.brand.logoDataUrl = dataUrl;
        renderPreview();
        scheduleSave();
      });
    } else {
      OB.brand.logoDataUrl = null;
      scheduleSave();
    }
    document.querySelector('#obLogoUpload b').textContent = file.name;
  });

  wireSimpleUpload('obGuideUpload', 'fBrandGuide', function(file){
    OB.brand.brandGuideName = file.name;
    document.querySelector('#obGuideUpload b').textContent = file.name;
    scheduleSave();
  });

  wireSimpleUpload('obScheduleUpload', 'fScheduleFile', function(file){
    OB.schedule.fileName = file.name;
    document.querySelector('#obScheduleUpload b').textContent = file.name;
    scheduleSave();
  });

  wireSimpleUpload('obMealUpload', 'fMealFile', function(file){
    OB.meals.fileName = file.name;
    document.querySelector('#obMealUpload b').textContent = file.name;
    scheduleSave();
  });

  wireSimpleUpload('obHeroUpload', 'fHeroImage', function(file){
    OB.media.heroName = file.name;
    document.querySelector('#obHeroUpload b').textContent = file.name;
    scheduleSave();
  });

  var galleryList = document.getElementById('obGalleryList');
  wireSimpleUpload('obGalleryUpload', 'fGalleryFiles', function(){});
  document.getElementById('fGalleryFiles').addEventListener('change', function(){
    Array.prototype.forEach.call(this.files, function(file){
      OB.media.galleryFiles.push({ name: file.name, size: file.size });
    });
    renderGalleryList();
    scheduleSave();
    this.value = '';
  });
  function renderGalleryList(){
    galleryList.innerHTML = '';
    OB.media.galleryFiles.forEach(function(f, i){
      var row = document.createElement('div');
      row.className = 'ob-fileitem';
      row.innerHTML = '<span class="name">' + f.name + '</span><button type="button" class="rm" aria-label="Remove">✕</button>';
      row.querySelector('.rm').addEventListener('click', function(){
        OB.media.galleryFiles.splice(i, 1);
        renderGalleryList();
        scheduleSave();
      });
      galleryList.appendChild(row);
    });
  }

  /* ---------------- schedule import method ---------------- */
  var importGrid = document.getElementById('obImportGrid');
  importGrid.querySelectorAll('.ob-choicecard').forEach(function(card){
    card.addEventListener('click', function(){
      importGrid.querySelectorAll('.ob-choicecard').forEach(function(c){ c.classList.remove('selected'); });
      card.classList.add('selected');
      OB.schedule.importMethod = card.getAttribute('data-import');
      var needsUpload = ['excel','pdf','image'].indexOf(OB.schedule.importMethod) !== -1;
      document.getElementById('obScheduleUploadWrap').style.display = (OB.schedule.importMethod === 'manual') ? 'none' : '';
      scheduleSave();
    });
  });

  document.querySelectorAll('[data-themed]').forEach(function(btn){
    btn.addEventListener('click', function(){
      document.querySelectorAll('[data-themed]').forEach(function(b){ b.classList.remove('on'); });
      btn.classList.add('on');
      var yes = btn.getAttribute('data-themed') === 'yes';
      OB.schedule.hasThemedDays = yes;
      document.getElementById('obDayThemes').style.display = yes ? '' : 'none';
      if (yes && OB.schedule.dayThemes.length === 0){
        addDayTheme('1', 'Arrival');
        addDayTheme('2', 'Grounding');
      }
      scheduleSave();
    });
  });

  var dayThemeList = document.getElementById('obDayThemeList');
  function addDayTheme(dayNum, name){
    var id = nextUid();
    OB.schedule.dayThemes.push({ id:id, day: dayNum || String(OB.schedule.dayThemes.length + 1), name: name || '' });
    renderDayThemes();
    scheduleSave();
  }
  function renderDayThemes(){
    dayThemeList.innerHTML = '';
    OB.schedule.dayThemes.forEach(function(d){
      var row = document.createElement('div');
      row.className = 'ob-row2';
      row.style.marginBottom = '10px';
      row.innerHTML =
        '<div class="ob-field" style="margin-bottom:0;"><label>Day</label><input type="text" value="' + escAttr(d.day) + '" data-role="day"></div>' +
        '<div class="ob-field" style="margin-bottom:0; display:flex; gap:8px; align-items:flex-end;">' +
          '<div style="flex:1;"><label>Theme</label><input type="text" value="' + escAttr(d.name) + '" placeholder="e.g. Expansion" data-role="name"></div>' +
          '<button type="button" class="ob-back" style="width:44px;height:44px;flex-shrink:0;" aria-label="Remove day" data-role="rm"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4"><path d="M18 6L6 18M6 6l12 12"/></svg></button>' +
        '</div>';
      row.querySelector('[data-role="day"]').addEventListener('input', function(){ d.day = this.value; scheduleSave(); });
      row.querySelector('[data-role="name"]').addEventListener('input', function(){ d.name = this.value; scheduleSave(); renderPreview(); });
      row.querySelector('[data-role="rm"]').addEventListener('click', function(){
        OB.schedule.dayThemes = OB.schedule.dayThemes.filter(function(x){ return x.id !== d.id; });
        renderDayThemes();
        scheduleSave();
      });
      dayThemeList.appendChild(row);
    });
  }
  document.getElementById('obAddDay').addEventListener('click', function(){ addDayTheme(String(OB.schedule.dayThemes.length + 1), ''); });

  /* ---------------- meals: times + change toggle ---------------- */
  document.querySelectorAll('#obMealTimes .ob-chip').forEach(function(chip){
    chip.addEventListener('click', function(){
      var val = chip.getAttribute('data-meal');
      var i = OB.meals.times.indexOf(val);
      if (i !== -1){ OB.meals.times.splice(i, 1); chip.classList.remove('on'); }
      else { OB.meals.times.push(val); chip.classList.add('on'); }
      scheduleSave();
    });
  });
  document.querySelectorAll('[data-mealchange]').forEach(function(btn){
    btn.addEventListener('click', function(){
      document.querySelectorAll('[data-mealchange]').forEach(function(b){ b.classList.remove('on'); });
      btn.classList.add('on');
      OB.meals.changesDaily = btn.getAttribute('data-mealchange') === 'yes';
      scheduleSave();
    });
  });

  /* ---------------- repeaters: teachers, facilities, resources ---------------- */
  function escAttr(s){ return (s || '').replace(/"/g, '&quot;'); }

  var teacherList = document.getElementById('obTeacherList');
  function addTeacher(){
    var t = { id: nextUid(), name:'', role:'', photoDataUrl:null, bio:'', specialties:[], instagram:'', website:'' };
    OB.teachers.push(t);
    renderTeachers();
    scheduleSave();
  }
  function renderTeachers(){
    teacherList.innerHTML = '';
    OB.teachers.forEach(function(t, idx){
      var card = document.createElement('div');
      card.className = 'ob-repeatcard';
      card.innerHTML =
        '<div class="rhead"><b>Teacher ' + (idx + 1) + '</b><button type="button" class="rmremove" data-role="rm">Remove</button></div>' +
        '<div class="ob-row2">' +
          '<div class="ob-field" style="margin-bottom:12px;"><label>Name</label><input type="text" data-role="name" value="' + escAttr(t.name) + '"></div>' +
          '<div class="ob-field" style="margin-bottom:12px;"><label>Role / title</label><input type="text" data-role="role" value="' + escAttr(t.role) + '" placeholder="e.g. Yoga & Breathwork Facilitator"></div>' +
        '</div>' +
        '<div class="ob-field" style="margin-bottom:12px;"><label>Profile photo <span class="opt">(optional)</span></label>' +
          '<div class="ob-upload compact" data-role="photozone"><input type="file" accept="image/*" data-role="photoinput"><div class="ic"><svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 3v14M5 10l7-7 7 7"/><path d="M4 19h16"/></svg></div><div><b style="margin-bottom:0;" data-role="photolabel">Upload photo</b></div></div>' +
        '</div>' +
        '<div class="ob-field" style="margin-bottom:12px;"><label>Short bio <span class="opt">(optional)</span></label><textarea data-role="bio">' + (t.bio || '') + '</textarea></div>' +
        '<div class="ob-field" style="margin-bottom:12px;"><label>Specialties <span class="opt">(optional)</span></label><div class="ob-chipselect" data-role="specialties"></div></div>' +
        '<div class="ob-row2">' +
          '<div class="ob-field" style="margin-bottom:0;"><label>Instagram <span class="opt">(optional)</span></label><input type="text" data-role="instagram" value="' + escAttr(t.instagram) + '" placeholder="@handle"></div>' +
          '<div class="ob-field" style="margin-bottom:0;"><label>Website <span class="opt">(optional)</span></label><input type="url" data-role="website" value="' + escAttr(t.website) + '"></div>' +
        '</div>';

      card.querySelector('[data-role="name"]').addEventListener('input', function(){ t.name = this.value; scheduleSave(); renderPreview(); });
      card.querySelector('[data-role="role"]').addEventListener('input', function(){ t.role = this.value; scheduleSave(); });
      card.querySelector('[data-role="bio"]').addEventListener('input', function(){ t.bio = this.value; scheduleSave(); });
      card.querySelector('[data-role="instagram"]').addEventListener('input', function(){ t.instagram = this.value; scheduleSave(); });
      card.querySelector('[data-role="website"]').addEventListener('input', function(){ t.website = this.value; scheduleSave(); });
      card.querySelector('[data-role="rm"]').addEventListener('click', function(){
        OB.teachers = OB.teachers.filter(function(x){ return x.id !== t.id; });
        renderTeachers(); scheduleSave();
      });

      var photoZone = card.querySelector('[data-role="photozone"]');
      var photoInput = card.querySelector('[data-role="photoinput"]');
      photoZone.addEventListener('click', function(e){ if (e.target !== photoInput) photoInput.click(); });
      photoInput.addEventListener('change', function(){
        if (this.files && this.files[0] && this.files[0].size < 600000){
          readAsDataUrl(this.files[0], function(url){
            t.photoDataUrl = url;
            card.querySelector('[data-role="photolabel"]').textContent = 'Photo added';
            scheduleSave(); renderPreview();
          });
        }
      });

      var specWrap = card.querySelector('[data-role="specialties"]');
      SPECIALTIES.forEach(function(s){
        var chip = document.createElement('button');
        chip.type = 'button';
        chip.className = 'ob-chip' + (t.specialties.indexOf(s) !== -1 ? ' on' : '');
        chip.textContent = s;
        chip.addEventListener('click', function(){
          var i = t.specialties.indexOf(s);
          if (i !== -1){ t.specialties.splice(i, 1); chip.classList.remove('on'); }
          else { t.specialties.push(s); chip.classList.add('on'); }
          scheduleSave();
        });
        specWrap.appendChild(chip);
      });

      teacherList.appendChild(card);
    });
  }
  document.getElementById('obAddTeacher').addEventListener('click', addTeacher);

  var facilityList = document.getElementById('obFacilityList');
  function addFacility(){
    OB.facilities.push({ id: nextUid(), name:'', photoDataUrl:null, hours:'', description:'', location:'' });
    renderFacilities(); scheduleSave();
  }
  function renderFacilities(){
    facilityList.innerHTML = '';
    OB.facilities.forEach(function(f, idx){
      var card = document.createElement('div');
      card.className = 'ob-repeatcard';
      card.innerHTML =
        '<div class="rhead"><b>Facility ' + (idx + 1) + '</b><button type="button" class="rmremove" data-role="rm">Remove</button></div>' +
        '<div class="ob-row2">' +
          '<div class="ob-field" style="margin-bottom:12px;"><label>Name</label><input type="text" data-role="name" value="' + escAttr(f.name) + '" placeholder="e.g. Herbal Sauna"></div>' +
          '<div class="ob-field" style="margin-bottom:12px;"><label>Opening hours <span class="opt">(optional)</span></label><input type="text" data-role="hours" value="' + escAttr(f.hours) + '"></div>' +
        '</div>' +
        '<div class="ob-field" style="margin-bottom:12px;"><label>Photo <span class="opt">(optional)</span></label>' +
          '<div class="ob-upload compact" data-role="photozone"><input type="file" accept="image/*" data-role="photoinput"><div class="ic"><svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 3v14M5 10l7-7 7 7"/><path d="M4 19h16"/></svg></div><div><b style="margin-bottom:0;" data-role="photolabel">Upload photo</b></div></div>' +
        '</div>' +
        '<div class="ob-field" style="margin-bottom:12px;"><label>Short description <span class="opt">(optional)</span></label><textarea data-role="description">' + (f.description || '') + '</textarea></div>' +
        '<div class="ob-field" style="margin-bottom:0;"><label>Location / map reference <span class="opt">(optional)</span></label><input type="text" data-role="location" value="' + escAttr(f.location) + '"></div>';

      card.querySelector('[data-role="name"]').addEventListener('input', function(){ f.name = this.value; scheduleSave(); });
      card.querySelector('[data-role="hours"]').addEventListener('input', function(){ f.hours = this.value; scheduleSave(); });
      card.querySelector('[data-role="description"]').addEventListener('input', function(){ f.description = this.value; scheduleSave(); });
      card.querySelector('[data-role="location"]').addEventListener('input', function(){ f.location = this.value; scheduleSave(); });
      card.querySelector('[data-role="rm"]').addEventListener('click', function(){
        OB.facilities = OB.facilities.filter(function(x){ return x.id !== f.id; });
        renderFacilities(); scheduleSave();
      });
      var photoZone = card.querySelector('[data-role="photozone"]');
      var photoInput = card.querySelector('[data-role="photoinput"]');
      photoZone.addEventListener('click', function(e){ if (e.target !== photoInput) photoInput.click(); });
      photoInput.addEventListener('change', function(){
        if (this.files && this.files[0] && this.files[0].size < 600000){
          readAsDataUrl(this.files[0], function(url){
            f.photoDataUrl = url;
            card.querySelector('[data-role="photolabel"]').textContent = 'Photo added';
            scheduleSave();
          });
        }
      });
      facilityList.appendChild(card);
    });
  }
  document.getElementById('obAddFacility').addEventListener('click', addFacility);

  var resourceList = document.getElementById('obResourceList');
  var RESOURCE_TYPES = ['Meditation','Audio','PDF','Book','Worksheet','Journal Prompt','Video','External Link'];
  function addResource(){
    OB.resources.push({ id: nextUid(), type: RESOURCE_TYPES[0], title:'', mode:'link', value:'', fileName:null });
    renderResources(); scheduleSave();
  }
  function renderResources(){
    resourceList.innerHTML = '';
    OB.resources.forEach(function(r, idx){
      var card = document.createElement('div');
      card.className = 'ob-repeatcard';
      var typeOptions = RESOURCE_TYPES.map(function(t){ return '<option' + (t === r.type ? ' selected' : '') + '>' + t + '</option>'; }).join('');
      card.innerHTML =
        '<div class="rhead"><b>Resource ' + (idx + 1) + '</b><button type="button" class="rmremove" data-role="rm">Remove</button></div>' +
        '<div class="ob-row2">' +
          '<div class="ob-field" style="margin-bottom:12px;"><label>Type</label><div class="ob-select"><select data-role="type">' + typeOptions + '</select></div></div>' +
          '<div class="ob-field" style="margin-bottom:12px;"><label>Title</label><input type="text" data-role="title" value="' + escAttr(r.title) + '"></div>' +
        '</div>' +
        '<div class="ob-field" style="margin-bottom:0;"><label>Link <span class="opt">(or upload a file below)</span></label><input type="url" data-role="value" value="' + escAttr(r.value) + '" placeholder="https://"></div>' +
        '<div class="ob-upload compact" data-role="filezone" style="margin-top:10px;"><input type="file" data-role="fileinput"><div class="ic"><svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 3v14M5 10l7-7 7 7"/><path d="M4 19h16"/></svg></div><div><b style="margin-bottom:0;" data-role="filelabel">Or upload a file</b></div></div>';

      card.querySelector('[data-role="type"]').addEventListener('change', function(){ r.type = this.value; scheduleSave(); });
      card.querySelector('[data-role="title"]').addEventListener('input', function(){ r.title = this.value; scheduleSave(); });
      card.querySelector('[data-role="value"]').addEventListener('input', function(){ r.value = this.value; scheduleSave(); });
      card.querySelector('[data-role="rm"]').addEventListener('click', function(){
        OB.resources = OB.resources.filter(function(x){ return x.id !== r.id; });
        renderResources(); scheduleSave();
      });
      var fileZone = card.querySelector('[data-role="filezone"]');
      var fileInput = card.querySelector('[data-role="fileinput"]');
      fileZone.addEventListener('click', function(e){ if (e.target !== fileInput) fileInput.click(); });
      fileInput.addEventListener('change', function(){
        if (this.files && this.files[0]){
          r.fileName = this.files[0].name;
          card.querySelector('[data-role="filelabel"]').textContent = r.fileName;
          scheduleSave();
        }
      });
      resourceList.appendChild(card);
    });
  }
  document.getElementById('obAddResource').addEventListener('click', addResource);

  /* ---------------- live preview ---------------- */
  var previewScreens = [document.getElementById('obPreviewScreen'), document.getElementById('obPreviewScreenMobile')];
  var MODULE_PREVIEW_LABELS = {
    calendar:'Calendar', schedule:'Schedule', teachers:'Teachers', meals:'Meals',
    facilities:'Facilities', gallery:'Gallery', resources:'Resources', audio:'Audio',
    reviews:'Reviews', shop:'Shop'
  };
  function renderPreview(){
    var name = OB.project.retreatName || 'Your Retreat';
    var logo = OB.brand.logoDataUrl;
    var primary = OB.brand.primaryColor || '#1B2E24';
    var secondary = OB.brand.secondaryColor || '#8A9A86';
    var tiles = OB.modules
      .filter(function(m){ return !(m === 'audio' && OB.plan === 'singleRetreat'); })
      .slice(0, 6)
      .map(function(m){ return '<div class="ob-pv-tile"><div class="ic"></div><b>' + (MODULE_PREVIEW_LABELS[m] || m) + '</b></div>'; })
      .join('');

    var html =
      '<div class="ob-pv-top" style="background:' + primary + ';">' +
        '<div class="logo">' + (logo ? '<img src="' + logo + '" alt="">' : '') + '</div>' +
        '<div class="name">' + escapeHtml(name) + '</div>' +
        '<div class="sub">Good Morning</div>' +
      '</div>' +
      '<div class="ob-pv-now"><div class="k">Happening Now</div><b>Welcome to your app</b></div>' +
      (tiles ? '<div class="ob-pv-grid">' + tiles + '</div>' : '<div class="ob-pv-empty">Select sections to see them appear here.</div>');

    previewScreens.forEach(function(el){
      if (!el) return;
      el.style.setProperty('--pv-primary', primary);
      el.style.setProperty('--pv-secondary', secondary);
      el.innerHTML = html;
    });
  }
  function escapeHtml(s){ var d = document.createElement('div'); d.textContent = s; return d.innerHTML; }

  /* ---------------- mobile preview sheet ---------------- */
  var previewBtn = document.getElementById('obPreviewBtn');
  var sheetOverlay = document.getElementById('obSheetOverlay');
  var sheetClose = document.getElementById('obSheetClose');
  previewBtn.addEventListener('click', function(){ renderPreview(); sheetOverlay.classList.add('open'); document.body.style.overflow = 'hidden'; });
  sheetClose.addEventListener('click', closeSheet);
  sheetOverlay.addEventListener('click', function(e){ if (e.target === sheetOverlay) closeSheet(); });
  function closeSheet(){ sheetOverlay.classList.remove('open'); document.body.style.overflow = ''; }
  document.addEventListener('keydown', function(e){ if (e.key === 'Escape' && sheetOverlay.classList.contains('open')) closeSheet(); });

  /* ---------------- review summary ---------------- */
  function goEdit(stepId){ showStep(stepId); }
  function renderSummary(){
    var wrap = document.getElementById('obSummary');
    var dateRange = (OB.project.startDate && OB.project.endDate) ? (OB.project.startDate + ' → ' + OB.project.endDate) : '—';
    var moduleNames = OB.modules.map(function(m){ var mod = MODULES.filter(function(x){ return x.key === m; })[0]; return mod ? mod.name : m; }).join(', ') || 'Core sections only';
    var rows = [
      { l:'Retreat', v: OB.project.retreatName || '—', step:'retreat' },
      { l:'Dates', v: dateRange, step:'retreat' },
      { l:'Logo', v: OB.brand.logoName || 'Not uploaded yet', step:'brand' },
      { l:'Primary color', v: OB.brand.primaryColor, step:'brand' },
      { l:'Secondary color', v: OB.brand.secondaryColor, step:'brand' },
      { l:'Selected sections', v: moduleNames, step:'modules' },
      { l:'Schedule status', v: OB.schedule.importMethod ? (OB.schedule.fileName || OB.schedule.link || OB.schedule.importMethod) : 'Not started', step:'schedule' },
      { l:'Teachers added', v: OB.teachers.length + ' teacher' + (OB.teachers.length === 1 ? '' : 's'), step:'teachers' },
      { l:'Media uploaded', v: (OB.media.heroName ? 1 : 0) + OB.media.galleryFiles.length + ' file(s)', step:'media' },
      { l:'Contact', v: (OB.contact.fullName || '—') + (OB.contact.email ? (' · ' + OB.contact.email) : ''), step:'contact' }
    ];
    wrap.innerHTML = rows.map(function(r){
      return '<div class="ob-summary-row"><span class="l">' + r.l + '</span><span class="v">' + escapeHtml(String(r.v)) + '<button type="button" class="editlink" data-editstep="' + r.step + '">Edit</button></span></div>';
    }).join('');
    wrap.querySelectorAll('[data-editstep]').forEach(function(b){
      b.addEventListener('click', function(){ goEdit(b.getAttribute('data-editstep')); });
    });
  }

  /* ---------------- submission ---------------- */
  var lastSubmission = null;
  document.getElementById('obSubmitBtn').addEventListener('click', function(){
    lastSubmission = JSON.parse(JSON.stringify(OB));
    lastSubmission.submittedAt = new Date().toISOString();
    try { localStorage.removeItem(STORAGE_KEY); } catch (err) {}
    showStep('success');
  });

  document.getElementById('obDownloadJson').addEventListener('click', function(){
    if (!lastSubmission) return;
    var blob = new Blob([JSON.stringify(lastSubmission, null, 2)], { type: 'application/json' });
    var url = URL.createObjectURL(blob);
    var a = document.createElement('a');
    a.href = url;
    a.download = (lastSubmission.project.retreatName || 'rbr-retreat-app').replace(/[^a-z0-9]+/gi, '-').toLowerCase() + '-submission.json';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(function(){ URL.revokeObjectURL(url); }, 1000);
  });

  /* ---------------- init ---------------- */
  loadDraft();
  document.getElementById('fPrimaryColor').value = OB.brand.primaryColor;
  document.getElementById('fPrimaryHex').value = OB.brand.primaryColor;
  document.getElementById('obPrimarySwatch').style.background = OB.brand.primaryColor;
  document.getElementById('fSecondaryColor').value = OB.brand.secondaryColor;
  document.getElementById('fSecondaryHex').value = OB.brand.secondaryColor;
  document.getElementById('obSecondarySwatch').style.background = OB.brand.secondaryColor;
  renderModuleGrid();
  renderTeachers();
  renderFacilities();
  renderResources();
  renderGalleryList();
  if (OB.schedule.dayThemes.length) { document.getElementById('obDayThemes').style.display = ''; renderDayThemes(); }
  renderPreview();
  showStep('intro');
})();
