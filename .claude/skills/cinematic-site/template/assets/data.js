/* Site content + config. Replace everything here per project.
   items[]   -> cards (data-featured / data-catalog) and the detail page (?id=)
   filters[] -> pill rows on the catalog; item.f[key] holds the item's value(s)
   sorts{}   -> catalog sort options (fn: null keeps data order) */
window.SITE = {
  name: 'Brand',
  smoothWheel: true, // eased wheel scrolling on pages with a scrub hero (desktop only)
  leads: {
    webhook: '', // e.g. Make.com / n8n / Formspree URL; receives the form fields as JSON
    // send: function (payload) { return fetch(...) }  // custom sender (Supabase, Telegram proxy...)
  }
};
window.SITE_DATA = {
  detailPage: 'agent.html', // name of the detail page in _source/pages (rename both together)
  items: [
    { id: 'first', name: 'First item', img: 'img/item-1.jpg', gallery: ['img/item-1.jpg', 'img/wide.jpg'],
      tag: 'New', tagStyle: 'acc', group: 'Group A', meta: ['Group A', '3 features'], price: '$1,000', sub: 'Group A',
      loc: 'Group A', ref: 'Ref 001', about: 'One paragraph that sells this item.',
      nums: [['3', 'features'], ['24/7', 'support'], ['5', 'days']], features: ['Feature one', 'Feature two'],
      spec: [['Type', 'A'], ['Status', 'Available']], terms: ['Term one', 'Term two'], f: { group: 'Group A' } }
  ],
  filters: [{ key: 'group', label: 'Group', values: ['Group A', 'Group B'] }],
  sorts: { f: { label: 'Featured', fn: null }, az: { label: 'A–Z', fn: function (a, b) { return a.name.localeCompare(b.name); } } }
};
