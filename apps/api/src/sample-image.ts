// Synthetic SVG illustration: no photographs or third-party assets are used.
export function sampleImage(variant = 0): string {
  let panels = '';
  for (let row = 0; row < 3; row++) for (let col = 0; col < 6; col++) {
    const x = 210 + col * 93, y = 230 + row * 102;
    panels += `<g transform="translate(${x} ${y})"><rect width="85" height="94" rx="3" fill="url(#panel)" stroke="#a7bdc9" stroke-width="2"/>`;
    for (let a = 1; a < 4; a++) panels += `<path d="M${a * 21.25} 2V92" stroke="#6a87a2" stroke-width=".7"/>`;
    for (let a = 1; a < 6; a++) panels += `<path d="M2 ${a * 15.7}H83" stroke="#6a87a2" stroke-width=".7"/>`;
    panels += '</g>';
  }
  const issue = variant === 0 ? '<path d="M440 344l15 20-9 16 18 22-7 20" fill="none" stroke="#e2ded5" stroke-width="3"/>' : '<ellipse cx="548" cy="376" rx="28" ry="20" fill="#b3a993" opacity=".8"/>';
  return `<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="800" viewBox="0 0 1200 800"><defs><linearGradient id="sky" x2="0" y2="1"><stop stop-color="#c0d9df"/><stop offset="1" stop-color="#e5eeea"/></linearGradient><linearGradient id="panel" x2="1" y2="1"><stop stop-color="#18374e"/><stop offset=".5" stop-color="#264c69"/><stop offset="1" stop-color="#152e44"/></linearGradient><pattern id="tiles" width="36" height="18" patternUnits="userSpaceOnUse"><rect width="36" height="18" fill="#8c6d5e"/><path d="M0 17H36M18 0V18" stroke="#6f544a" stroke-width="2"/></pattern></defs><rect width="1200" height="800" fill="url(#sky)"/><path d="M0 280Q180 210 360 280T720 280T1200 240V800H0" fill="#819786"/><path d="M0 370Q240 260 500 360T1200 300V800H0" fill="#58715c"/><rect x="125" y="460" width="830" height="285" fill="#ded8ca"/><path d="M70 565L180 175H920L1025 565Z" fill="url(#tiles)"/><path d="M180 175H920" stroke="#5c473c" stroke-width="9"/><g transform="translate(0 20)">${panels}${issue}</g><rect x="807" y="107" width="54" height="122" fill="#9a887a"/><rect x="800" y="100" width="68" height="16" fill="#6d625c"/><rect x="225" y="627" width="125" height="118" fill="#879b9b"/><path d="M287 627V745M225 686H350" stroke="#f2eee3" stroke-width="7"/><rect x="705" y="627" width="125" height="118" fill="#879b9b"/><path d="M767 627V745M705 686H830" stroke="#f2eee3" stroke-width="7"/><rect y="750" width="1200" height="50" fill="#8a9c79"/><rect x="24" y="24" width="235" height="35" rx="5" fill="#ffffff" opacity=".85"/><text x="38" y="47" fill="#34423c" font-family="sans-serif" font-size="15">SYNTHETIC DEMO · NOT A PHOTO</text></svg>`;
}
