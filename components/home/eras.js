export const ERAS = [
    { name: 'Flathead',        slug: 'flathead',          img: 'flathead.webp',           years: '1930–1952' },
    { name: 'Knucklehead',     slug: 'knucklehead',       img: 'knucklehead.webp',        years: '1936–1947' },
    { name: 'Panhead',         slug: 'panhead',           img: 'panhead.webp',            years: '1948–1965' },
    { name: 'Shovelhead',      slug: 'shovelhead',        img: 'shovelhead.webp',         years: '1966–1984' },
    { name: 'Ironhead',        slug: 'ironhead-sportster',img: 'ironhead-sportster.webp', years: '1957–1985' },
    { name: 'Evolution',       slug: 'evolution',         img: 'evolution.webp',          years: '1984–1999' },
    { name: 'Evo Sportster',   slug: 'evo-sportster',     img: 'evo-sportster.webp',      years: '1986–2021' },
    { name: 'Twin Cam',        slug: 'twin-cam',          img: 'twin-cam.webp',           years: '1999–2017' },
    { name: 'Milwaukee Eight', slug: 'milwaukee-8',       img: 'milwaukee-8.webp',        years: '2017–present' },
    { name: 'Chopper',         slug: 'chopper',           img: 'chopper.webp',            years: 'Universal' },
  ];
  
  export const YEARS = Array.from(
    { length: new Date().getFullYear() - 1930 + 1 },
    (_, i) => new Date().getFullYear() - i
  );
  