// Script executed each time Chrome DevTools opens

// Custom browser compatibility panel.

const browsers = ['chrome', 'firefox', 'safari', 'edge', 'ie'];

async function loadCSSPropertyCompat(propertyName) {
  const path = `browser-compat-data/css/properties/${propertyName}.json`
  const data = await window.fetch(path).then((response) => response.json());

  const base = data['css']['properties'][propertyName];
  const support = base['__compat']['support'];

  return {support, values: base};
}

function versionFor(browser, supportData) {
  if (!supportData) {
    return undefined;
  }
  let browserSupportData = supportData[browser];
  if (!browserSupportData) {
    return undefined;
  }

  if ('length' in browserSupportData) {
    // probably array, assume 1st
    // TODO: probably not always right
    browserSupportData = browserSupportData[0];
  }
  return browserSupportData['version_added'];
}

async function parseCSS(panelWindow, text) {
  const style = document.createElement('style');
  style.textContent = text;
  panelWindow.document.body.appendChild(style);

  const allProperties = {};

  const rules = Array.from(style.sheet.cssRules);
  rules.forEach((rule) => {
    if (!(rule instanceof CSSStyleRule)) {
      return;
    }
    const style = rule.style;
    const localProps = [];
    for (let i = 0; i < style.length; ++i) {
      const propertyName = style.item(i);
      const value = style.getPropertyValue(propertyName);
      if (value === 'initial' || value === 'default' || value === 'inherit') {
        continue;
      }
      if (propertyName.startsWith('-')) {
        // TODO: warn but don't complain
        continue;  // ignore prefixed stuff
      }

      if (!(propertyName in allProperties)) {
        allProperties[propertyName] = new Set();
      }
      // TODO: adds via set, but will include things like border, padding etc
      allProperties[propertyName].add(style.getPropertyValue(propertyName));
      localProps.push(propertyName);
    }
    console.debug('got rule', rule, rule.cssText, localProps);
  });
  style.remove();  // don't need us anymore, don't allow any display of said rules
  console.info('parsed', rules.length, 'rules', allProperties);

  const supportData = {};
  const promises = [];
  Object.keys(allProperties).forEach((propertyName) => {
    const p = loadCSSPropertyCompat(propertyName).catch((e) => {
      console.warn('missing property support', propertyName);
      return {support: {}, values: {}};
    }).then((data) => {
      supportData[propertyName] = data;
    });
    promises.push(p);
  });
  await Promise.all(promises);

  const out = {};
  browsers.forEach((browser) => {
    out[browser] = [];

    Object.keys(allProperties).forEach((propertyName) => {
      const {support, values} = supportData[propertyName];
      let versionAdded = versionFor(browser, support);

      if (versionAdded === undefined) {
        return;  // no data
      }

      if (versionAdded === false) {
        versionAdded = Infinity;
      } else if (versionAdded === true) {
        versionAdded = '';
      }
      out[browser].push({versionAdded, propertyName});
    });

    out[browser].sort((a, b) => {
      return b.versionAdded - a.versionAdded;
    })
  });

  console.info('got browser data', out);
  return out;
}

function initializeWindow(panelWindow) {
  const d = panelWindow.document;
  d.body.appendChild(document.createTextNode('loaded: ' + new Date()));

  const info = d.getElementById('info');

  const button = d.getElementById('inspect');
  button.addEventListener('click', (ev) => {
    const iw = chrome.devtools.inspectedWindow;

    iw.eval(`
      Array.from(document.styleSheets).map((ss) => {
        let rules;
        try {
          rules = Array.from(ss.cssRules);
        } catch (e) {
          return null;
        }
        return rules.map((r) => r.cssText);
      }).filter((rules) => rules);
      `, {useContentScriptContext: true}, (out, err) => {
        if (err) {
          console.error('could not load CSS', err);
          return;
        }
        const allRules = out.map((rules) => rules.join('\n')).join('\n\n');
        parseCSS(panelWindow, allRules).then((out) => {

          info.textContent = '';

          const dl = document.createElement('dl');
          Object.keys(out).forEach((browser) => {
            const compat = out[browser];
            let reason = '';
            let version = '';
            if (compat.length) {
              const first = compat[0];
              version = first.versionAdded;

              // hack to show all reasons at this version
              const reasons = [];
              compat.forEach((x) => {
                if (x.versionAdded >= version) {
                  reasons.push(x.propertyName);
                }
              });
              reason = reasons.join(', ');
            }

            if (version === Infinity) {
              version = '🚫';
            } else if (version === '') {
              version = '🆗';
            }

            const dt = document.createElement('dt');
            dt.textContent = browser;
            const dd = document.createElement('dd');
            dd.innerHTML = `<big>${version}</big> <small>${reason}</small>`;

            dl.appendChild(dt);
            dl.appendChild(dd);
          });

          info.appendChild(dl);

        });
      });
  });
}

const title = 'Browser Compatibility';
chrome.devtools.panels.create(title, 'img/toolbarIcon.png', 'panel.html', (extensionPanel) => {
  let initialized = false;
  extensionPanel.onShown.addListener((panelWindow) => {
    if (!initialized) {
      initialized = true;
      initializeWindow(panelWindow);
    }
  });
});

