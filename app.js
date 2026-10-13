/* Visa kommuner sammanslagna från SCB:s DeSO-områden. */
'use strict';
const statusEl = document.getElementById('status');
const choices = [...document.querySelectorAll('input[name="map-layer"]')];
if (typeof L === 'undefined') {
  statusEl.textContent = 'Kartbiblioteket kunde inte laddas. Kontrollera internetanslutningen och ladda om sidan.';
} else {
  const map = L.map('map', {preferCanvas:true}).setView([62.4,16.5],5);
  let tileFailed = false;
  L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
    maxZoom:19, attribution:'&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> · Områden: SCB'
  }).addTo(map).on('tileerror', () => {tileFailed = true; updateStatus();});
  L.control.scale({imperial:false}).addTo(map);
  const colors = {A:'#bf9d55',B:'#528faf',C:'#408575'};
  // Klassgränser (inklusive): 0, 1–9, 10–49, 50–199, 200–999, >=1000.
  const populationColor = n => n === 0 ? '#eff3ff' : n < 10 ? '#c6dbef' : n < 50 ? '#9ecae1' : n < 200 ? '#6baed6' : n < 1000 ? '#3182bd' : '#08519c';
  const files = {kommuner:'kommuner.geojson', deso:'deso.geojson', rutor:'uppsala_kilometerrutor.geojson'};
  const layers = {
    rutor: {label:'Kilometerrutor – Uppsala',unit:'kilometerrutor',count:0,layer:null,failed:false,style:f => ({color:'#34536a',weight:0.7,fillColor:populationColor(f.properties.beftotalt),fillOpacity:0.75})},
    kommuner: {
      label:'Kommuner', unit:'kommuner', count:0, layer:null, failed:false,
      style:() => ({color:'#0c514d',weight:1.2,fillColor:'#408575',fillOpacity:0.2})
    },
    deso: {
      label:'DeSO-områden', unit:'DeSO-områden', count:0, layer:null, failed:false,
      style:feature => ({color:colors[String(feature.properties.desokod)[4]] || '#408575',weight:0.8,fillOpacity:0.2})
    }
  };
  let activeKey = 'kommuner', selected = null;
  const formatNumber = value => new Intl.NumberFormat('sv-SE').format(value);
  const dataCache = {};
  const comparison = document.getElementById('comparison');
  const mainView = document.querySelector('main');
  const compareButton = document.getElementById('compare-open');
  let comparisonMaps = null, syncing = false, mainViewState = null;

  function comparisonDetails(feature, key) {
    const panel = document.getElementById('compare-' + key + '-details');
    const p = feature.properties;
    const fields = key === 'deso' ? Object.entries(p) : [
      ['Rut-ID',p.rutid_scb],['Invånare i hela rutan',formatNumber(p.beftotalt)],
      ['Statistikdatum',String(p.referenstid).replace(/^(\d{4})(\d{2})(\d{2})$/, '$1-$2-$3')],
      ['Korsar kommungränsen',p.gransruta ? 'Ja' : 'Nej']
    ];
    const list = document.createElement('dl');
    fields.forEach(([name,value]) => {
      const dt = document.createElement('dt'), dd = document.createElement('dd');
      dt.textContent = name; dd.textContent = value ?? 'Saknas'; list.append(dt,dd);
    });
    panel.replaceChildren(list);
    if (key === 'rutor' && p.gransruta) {
      const warning = document.createElement('p'); warning.className = 'boundary-warning';
      warning.textContent = 'Gränsruta: befolkningen gäller hela rutan och kan inte tilldelas enbart Uppsala kommun. Ingen areaviktning har gjorts.';
      panel.append(warning);
    }
  }

  function syncView(source, target) {
    if (syncing || comparison.hidden) return;
    const center = source.getCenter(), zoom = source.getZoom();
    if (target.getZoom() === zoom && target.getCenter().equals(center,1e-9)) return;
    syncing = true;
    try { target.setView(center,zoom,{animate:false}); }
    finally { syncing = false; }
  }

  // Lika stora kartytor krävs: samma centrum/zoom ger annars olika utsnitt.
  // Den smalaste panelens bredd används även vid asymmetriska panelstorlekar.
  function resizeComparison() {
    if (comparison.hidden || !comparisonMaps) return;
    const nodes = ['deso','rutor'].map(key => document.getElementById('compare-' + key));
    const width = Math.floor(Math.min(...nodes.map(node => node.parentElement.clientWidth)));
    const center = comparisonMaps[0].getCenter(), zoom = comparisonMaps[0].getZoom();
    syncing = true;
    try {
      nodes.forEach(node => {node.style.width = width + 'px';});
      comparisonMaps.forEach(m => {
        m.invalidateSize({pan:false,animate:false});
        m.setView(center,zoom,{animate:false});
      });
    } finally { syncing = false; }
  }

  function createComparison() {
    comparisonMaps = ['deso','rutor'].map(key => {
      const m = L.map('compare-' + key,{preferCanvas:true}).setView([59.86,17.64],10);
      L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png',{
        maxZoom:19,attribution:'&copy; OpenStreetMap · SCB'
      }).addTo(m).on('tileerror',() => {
        document.getElementById('compare-' + key + '-details').textContent = 'Bakgrundskartan kunde inte laddas. Polygonerna kan fortfarande användas.';
      });
      L.control.scale({imperial:false}).addTo(m);
      const features = key === 'deso'
        ? dataCache.deso.features.filter(f => f.properties.kommunkod === '0380')
        : dataCache.rutor.features;
      L.geoJSON({type:'FeatureCollection',features},{style:layers[key].style,
        onEachFeature(f,l) { l.on('click',() => comparisonDetails(f,key)); }
      }).addTo(m);
      const legend = document.getElementById(key === 'deso' ? 'deso-legend' : 'rutor-legend').cloneNode(true);
      legend.removeAttribute('id'); legend.hidden = false;
      document.getElementById('compare-' + key + '-legend').append(legend);
      return m;
    });
    comparisonMaps[0].on('moveend',() => syncView(comparisonMaps[0],comparisonMaps[1]));
    comparisonMaps[1].on('moveend',() => syncView(comparisonMaps[1],comparisonMaps[0]));
    const observer = new ResizeObserver(() => resizeComparison());
    document.querySelectorAll('.comparison-grid article').forEach(node => observer.observe(node));
  }

  compareButton.addEventListener('click',() => {
    map.stop();
    mainViewState = {center:map.getCenter(),zoom:map.getZoom()};
    mainView.hidden = true; comparison.hidden = false;
    if (!comparisonMaps) createComparison();
    // Beräkna startvyn vid varje öppning, efter att kartytorna fått rätt storlek.
    comparisonMaps.forEach(m => m.stop());
    resizeComparison();
    comparisonMaps[0].fitBounds(layers.rutor.layer.getBounds(),{padding:[15,15],animate:false});
    syncView(comparisonMaps[0],comparisonMaps[1]);
    document.getElementById('comparison-title').focus();
  });
  document.getElementById('compare-close').addEventListener('click',() => {
    comparison.hidden = true; mainView.hidden = false;
    map.invalidateSize({pan:false,animate:false});
    map.setView(mainViewState.center,mainViewState.zoom,{animate:false,reset:true});
    compareButton.focus();
  });

  function updateStatus() {
    const active = layers[activeKey];
    if (active.failed) {
      statusEl.textContent = active.label + ' kunde inte laddas. Ladda om sidan eller välj ett annat lager.';
    } else if (!active.layer) {
      statusEl.textContent = 'Läser in ' + active.unit + '…';
    } else {
      statusEl.textContent = formatNumber(active.count) + ' ' + active.unit + (activeKey === 'rutor' ? ' · 2025-12-31' : ' · 2025')
        + (tileFailed ? ' · Bakgrundskartan kunde inte laddas.' : '');
    }
  }

  function clearSelection() {
    if (selected) layers[selected.key].layer.resetStyle(selected.layer);
    selected = null;
    const instruction = document.createElement('p');
    instruction.textContent = activeKey === 'kommuner'
      ? 'Klicka på kartan för att välja en kommun.'
      : activeKey === 'rutor' ? 'Klicka på kartan för att välja en kilometerruta.' : 'Klicka på kartan för att välja ett DeSO-område.';
    document.getElementById('details').replaceChildren(instruction);
  }

  function selectArea(layer, key) {
    clearSelection();
    selected = {layer, key};
    layer.setStyle({color:'#0c514d',weight:3,fillOpacity:0.5});
    layer.bringToFront();
    const p = layer.feature.properties;
    const details = document.getElementById('details');
    const title = document.createElement('strong');
    title.textContent = key === 'kommuner' ? (p.kommun || 'Kommun ' + p.kommunkod) : key === 'rutor' ? 'Kilometerruta' : p.desokod;
    const fields = key === 'kommuner'
      ? [['Kommunkod',p.kommunkod],['Län',p.lan],['Folkmängd',p.folkmangd == null ? 'Saknas' : formatNumber(p.folkmangd)],['Kvinnor',p.kvinnor == null ? 'Saknas' : formatNumber(p.kvinnor)],['Män',p.man == null ? 'Saknas' : formatNumber(p.man)],['Statistikdatum',p.befolkningsdatum],['Antal DeSO-områden',formatNumber(p.deso_antal)],['Gränsversion',p.version]]
      : key === 'rutor' ? [['Rut-ID',p.rutid_scb],['Invånare i hela rutan',formatNumber(p.beftotalt)],['Referensdatum',String(p.referenstid).replace(/^(\d{4})(\d{2})(\d{2})$/, '$1-$2-$3')],['Korsar kommungränsen',p.gransruta ? 'Ja' : 'Nej']] : [['Kommunkod',p.kommunkod],['Länskod',p.lanskod],['RegSO-kod',p.regsokod],['Version',p.version]];
    const list = document.createElement('dl');
    for (const [label,value] of fields) {
      const term = document.createElement('dt'), definition = document.createElement('dd');
      term.textContent = label;
      definition.textContent = value ?? 'Saknas';
      list.append(term,definition);
    }
    details.replaceChildren(title,list);
    if (key === 'rutor') {
      const note = document.createElement('p');
      note.className = p.gransruta ? 'boundary-warning' : '';
      note.textContent = p.gransruta ? 'Gränsruta: befolkningen gäller hela kilometerrutan och kan inte tilldelas enbart Uppsala kommun. Ingen areaviktning har gjorts. Källa: SCB, 2025-12-31.' : 'Befolkningen gäller hela kilometerrutan. Källa: SCB, 2025-12-31.';
      details.append(note);
    }
    if (key === 'kommuner') {
      const source = document.createElement('p');
      const link = document.createElement('a');
      link.textContent = 'Källa: SCB · Befolkningsstatistik';
      link.href = 'https://www.statistikdatabasen.scb.se/pxweb/sv/ssd/START__BE__BE0101__BE0101A/BefolkManadCKM/';
      link.target = '_blank'; link.rel = 'noopener';
      source.append(link); details.append(source);
    }
  }

  function showLayer(key) {
    clearSelection();
    if (layers[activeKey].layer) map.removeLayer(layers[activeKey].layer);
    activeKey = key;
    if (layers[key].layer) layers[key].layer.addTo(map);
    if (key === 'rutor' && layers[key].layer) map.fitBounds(layers[key].layer.getBounds(),{padding:[15,15]});
    document.getElementById('reset').textContent = key === 'rutor' ? 'Visa Uppsalarutorna' : 'Visa hela Sverige';
    document.getElementById('rutor-legend').hidden = key !== 'rutor';
    document.getElementById('detail-title').textContent = key === 'kommuner' ? 'Vald kommun' : key === 'rutor' ? 'Vald kilometerruta' : 'Valt DeSO-område';
    document.getElementById('kommun-legend').hidden = key !== 'kommuner';
    document.getElementById('deso-legend').hidden = key !== 'deso';
    document.getElementById('map-note').textContent = layers[key].label + (key === 'rutor' ? ' · 2025-12-31' : ' · 2025');
    clearSelection();
    updateStatus();
  }

  choices.forEach(choice => choice.addEventListener('change', () => {
    if (choice.checked) showLayer(choice.value);
  }));
  document.getElementById('reset').addEventListener('click', () => {
    const active = layers[activeKey].layer;
    if (active) map.fitBounds(active.getBounds(),{padding:[15,15]});
  });

  async function loadLayer(key) {
    try {
      const response = await fetch(files[key]);
      if (!response.ok) throw new Error('Data saknas');
      const data = await response.json();
      dataCache[key] = data;
      layers[key].count = data.features.length;
      layers[key].layer = L.geoJSON(data, {
        style:layers[key].style,
        onEachFeature(feature,layer) {
          const label = document.createElement('span');
          label.textContent = key === 'kommuner'
            ? (feature.properties.kommun || 'Kommun ' + feature.properties.kommunkod)
            : key === 'rutor' ? 'Ruta ' + feature.properties.rutid_scb : 'DeSO ' + feature.properties.desokod;
          layer.bindTooltip(label,{sticky:true});
          layer.on('click', () => selectArea(layer,key));
        }
      });
      document.getElementById(key + '-count').textContent = formatNumber(data.features.length);
      choices.find(choice => choice.value === key).disabled = false;
      if (activeKey === key) {
        layers[key].layer.addTo(map);
        map.fitBounds(layers[key].layer.getBounds(),{padding:[15,15]});
      }
    } catch (error) {
      layers[key].failed = true;
      document.getElementById(key + '-count').textContent = 'Kunde inte laddas';
    }
    updateStatus();
    compareButton.disabled = !(layers.deso.layer && layers.rutor.layer);
    document.getElementById('compare-status').textContent = layers.deso.failed || layers.rutor.failed
      ? 'Jämförelsen kunde inte förberedas. Ladda om sidan.'
      : compareButton.disabled ? 'Läser in jämförelsens kartlager…' : 'Jämför Uppsalas DeSO-områden och befolkningsrutor.';
  }

  // Kommunlagret visas först; DeSO-lagret är ett separat val.
  loadLayer('kommuner');
  loadLayer('deso');
  loadLayer('rutor');
}
