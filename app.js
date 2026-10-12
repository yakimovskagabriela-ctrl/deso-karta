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
  const layers = {
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

  function updateStatus() {
    const active = layers[activeKey];
    if (active.failed) {
      statusEl.textContent = active.label + ' kunde inte laddas. Ladda om sidan eller välj det andra lagret.';
    } else if (!active.layer) {
      statusEl.textContent = 'Läser in ' + active.unit + '…';
    } else {
      statusEl.textContent = formatNumber(active.count) + ' ' + active.unit + ' · 2025'
        + (tileFailed ? ' · Bakgrundskartan kunde inte laddas.' : '');
    }
  }

  function clearSelection() {
    if (selected) layers[selected.key].layer.resetStyle(selected.layer);
    selected = null;
    const instruction = document.createElement('p');
    instruction.textContent = activeKey === 'kommuner'
      ? 'Klicka på kartan för att välja en kommun.'
      : 'Klicka på kartan för att välja ett DeSO-område.';
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
    title.textContent = key === 'kommuner' ? (p.kommun || 'Kommun ' + p.kommunkod) : p.desokod;
    const fields = key === 'kommuner'
      ? [['Kommunkod',p.kommunkod],['Län',p.lan],['Folkmängd',p.folkmangd == null ? 'Saknas' : formatNumber(p.folkmangd)],['Kvinnor',p.kvinnor == null ? 'Saknas' : formatNumber(p.kvinnor)],['Män',p.man == null ? 'Saknas' : formatNumber(p.man)],['Statistikdatum',p.befolkningsdatum],['Antal DeSO-områden',formatNumber(p.deso_antal)],['Gränsversion',p.version]]
      : [['Kommunkod',p.kommunkod],['Länskod',p.lanskod],['RegSO-kod',p.regsokod],['Version',p.version]];
    const list = document.createElement('dl');
    for (const [label,value] of fields) {
      const term = document.createElement('dt'), definition = document.createElement('dd');
      term.textContent = label;
      definition.textContent = value ?? 'Saknas';
      list.append(term,definition);
    }
    details.replaceChildren(title,list);
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
    document.getElementById('detail-title').textContent = key === 'kommuner' ? 'Vald kommun' : 'Valt DeSO-område';
    document.getElementById('kommun-legend').hidden = key !== 'kommuner';
    document.getElementById('deso-legend').hidden = key !== 'deso';
    document.getElementById('map-note').textContent = layers[key].label + ' · 2025';
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
      const response = await fetch(key === 'kommuner' ? 'Kommuner.geojson' : 'deso.geojson');
      if (!response.ok) throw new Error('Data saknas');
      const data = await response.json();
      layers[key].count = data.features.length;
      layers[key].layer = L.geoJSON(data, {
        style:layers[key].style,
        onEachFeature(feature,layer) {
          const label = document.createElement('span');
          label.textContent = key === 'kommuner'
            ? (feature.properties.kommun || 'Kommun ' + feature.properties.kommunkod)
            : 'DeSO ' + feature.properties.desokod;
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
  }

  // Kommunlagret visas först; DeSO-lagret är ett separat val.
  loadLayer('kommuner');
  loadLayer('deso');
}
