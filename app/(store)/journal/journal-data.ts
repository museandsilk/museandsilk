export type JournalSection = { heading: string; body: string };

export type JournalArticle = {
  slug: string;
  title: string;
  category: string;
  readTime: string;
  excerpt: string;
  intro: string;
  sections: JournalSection[];
};

export const journalArticles: JournalArticle[] = [
  {
    slug: "seven-ways-to-wear-a-scarf",
    title: "Seven quiet ways to wear a silk scarf",
    category: "Styling",
    readTime: "6 min",
    excerpt: "Small gestures that give one scarf an entirely different attitude — no two knots read the same way.",
    intro: "A single scarf can carry a week of outfits if you let the knot do the talking. None of these require more than a minute in front of a mirror.",
    sections: [
      {
        heading: "The soft knot",
        body: "Fold the scarf diagonally into a loose triangle, roll it from the point toward the base, then knot it just off-center at the throat. Leave enough slack in the fabric for the silk to catch light as you move — a tight, symmetrical knot reads costume-like, while an off-center one reads considered.",
      },
      {
        heading: "At the collar",
        body: "Slip a narrow fold beneath an open shirt collar, letting only a few centimetres show at the neckline. Keep the visible ends short and uneven rather than tying a bow — the point is a line of color peeking through, not a statement piece competing with the shirt.",
      },
      {
        heading: "On the bag handle",
        body: "Wrap a smaller scarf or bandana twice around a structured bag handle and secure it with one discreet knot, tucking the tails alongside the handle. This is the easiest way to introduce pattern to a neutral bag without touching your outfit at all.",
      },
      {
        heading: "As a headband",
        body: "Fold on the bias so the scarf sits flat rather than bulky, place the centre point at your hairline, cross the ends beneath your hair at the nape, and tie in a low knot. A silk-touch fabric holds this shape through a full day without slipping.",
      },
      {
        heading: "The double wrist wrap",
        body: "Wrap a narrow scarf twice around the wrist, over a watch or stacked with bracelets, and finish with a small flat knot so one pointed end remains visible. It reads as jewellery rather than accessory, and travels well since it takes almost no space.",
      },
      {
        heading: "Under a blazer",
        body: "Drape a square scarf inside an open blazer or coat so only its border and a triangle of colour show at the neckline. This works especially well with a plain, structured jacket that needs one point of warmth without additional bulk.",
      },
      {
        heading: "The simple drape",
        body: "For a larger scarf, resist the urge to knot it at all. Fold once on the diagonal, drape it around the neck and let both ends fall unevenly down the front. The ease of an unstyled drape is often the most flattering option, particularly with tailoring.",
      },
    ],
  },
  {
    slug: "silk-care",
    title: "Keeping silk soft: a care guide",
    category: "Care",
    readTime: "5 min",
    excerpt: "A little restraint preserves silk-touch fabric far better than frequent washing or aggressive pressing.",
    intro: "Silk and silk-touch fabrics reward patience. Most of what shortens their life is over-handling — too much washing, too much heat, too much folding along the same crease — rather than ordinary wear.",
    sections: [
      {
        heading: "After wearing",
        body: "Let the scarf air out away from direct sunlight for an hour before folding it away — this releases any moisture or scent picked up during the day. Avoid spraying perfume, hairspray or oils directly onto the fabric; apply these before dressing instead, since silk fibres absorb and hold scent and residue more readily than cotton.",
      },
      {
        heading: "Cleaning",
        body: "Always follow the care label supplied with the specific piece, since composition can vary between prints and weights. When a label recommends dry cleaning, use a reputable specialist rather than a standard wash cycle. For light marks between cleans, blot — never rub — with a barely damp cloth and let it air dry flat.",
      },
      {
        heading: "Pressing",
        body: "If pressing is needed, use the lowest heat setting suited to the fabric, iron from the reverse side, and place a clean pressing cloth between the iron and the scarf. Keep the iron moving at all times; silk scarches and yellows quickly under a stationary iron, even at low heat.",
      },
      {
        heading: "Storage",
        body: "Fold along a different line each time you store the piece, so a single crease does not become permanent. Store flat or loosely rolled in the included pouch, away from direct light, humidity and rough jewellery that can snag the weave. Cedar or lavender sachets nearby help deter moths without touching the fabric directly.",
      },
      {
        heading: "Travel",
        body: "Roll rather than fold when packing for a trip — rolling avoids sharp creases and takes surprisingly little space. Keep scarves away from zippers, buckles and metal fastenings inside a bag, which are the most common cause of small pulls in silk-touch weaves.",
      },
    ],
  },
  {
    slug: "choosing-scarf-colours",
    title: "Choosing scarf colours for your wardrobe",
    category: "Styling",
    readTime: "5 min",
    excerpt: "A short framework for building a scarf edit that works with what you already own, rather than against it.",
    intro: "The easiest wardrobe mistake with scarves is buying for the piece alone rather than for the coats, knits and shirts it will actually sit against. A short list of principles makes the choice much simpler.",
    sections: [
      {
        heading: "Start from your neutrals",
        body: "Look at the three colours you wear most at the neckline — likely a black, camel, grey or white — and choose a first scarf that contrasts gently with all three rather than matching any one exactly. A warm oxblood or deep forest tends to sit well against most neutral outerwear.",
      },
      {
        heading: "One statement, one quiet",
        body: "If you are building a small edit, balance a bolder printed piece with a second in a single, muted tone. The quiet scarf becomes the one you reach for daily; the statement piece earns its place on the days that call for it.",
      },
      {
        heading: "Consider your undertone, not just the trend",
        body: "Warmer skin undertones generally carry ivory, camel, oxblood and olive with ease, while cooler undertones often suit charcoal, dusk blue and plum. This is a starting point rather than a rule — the right test is always how a colour looks near your face in daylight, not on a screen.",
      },
      {
        heading: "Match the season to the weight",
        body: "A lightweight silk-touch scarf in a bright or pastel tone reads naturally in warmer months, while a heavier weave in a deeper, richer colour belongs to autumn and winter layering. Buying to the weight, not just the colour, prevents a scarf sitting unused for half the year.",
      },
      {
        heading: "Let bandanas take the risk",
        body: "Because a bandana covers less ground than a full scarf, it is the more forgiving place to try a colour or print you are unsure about — on a bag handle, wrist or hair, a bold choice reads as a considered accent rather than a commitment.",
      },
    ],
  },
];

export function getJournalArticle(slug: string): JournalArticle | undefined {
  return journalArticles.find((article) => article.slug === slug);
}
