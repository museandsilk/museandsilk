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
  {
    slug: "ways-to-wear-a-bandana",
    title: "The bandana, reconsidered",
    category: "Styling",
    readTime: "5 min",
    excerpt: "A smaller piece of fabric with more range than most people give it credit for — five ways to put one to work.",
    intro: "A bandana asks less of you than a full scarf and, for that reason, tends to get worn more. It earns its place through repetition rather than occasion — here is where it actually goes.",
    sections: [
      {
        heading: "Knotted at the neck",
        body: "Fold into a narrow band, cross it once at the front and tie a small flat knot to one side rather than centred — an off-centre knot reads considered rather than costume-like, and sits well under an open collar or crew neck.",
      },
      {
        heading: "Through the belt loops",
        body: "Thread a folded bandana through two or three belt loops so a short length hangs at the hip, in place of or alongside a belt. It is an easy way to bring pattern into a plain pair of trousers without touching what you're wearing above the waist.",
      },
      {
        heading: "As a hair tie",
        body: "Fold on the bias into a narrow strip, wrap twice around a low ponytail or bun, and knot flat at the base rather than in a bow. Silk-touch fabric holds shape through a full day without the crease marks a cotton bandana leaves behind.",
      },
      {
        heading: "Tied to a bag strap",
        body: "Wrap once around a bag strap near the shoulder and secure with a single knot, letting the tails sit flush rather than dangling. This is the lowest-commitment way to try a bold print, since it changes the bag rather than the outfit.",
      },
      {
        heading: "Folded in a breast pocket",
        body: "A small square folded into quarters and tucked so only a triangle shows works as a quieter alternative to a full pocket square — pick one in a tone close to your jacket for something that reads as texture rather than a statement.",
      },
    ],
  },
  {
    slug: "choosing-sunglasses-for-your-face-shape",
    title: "Choosing sunglasses for your face shape",
    category: "Guide",
    readTime: "6 min",
    excerpt: "A short, practical way to narrow down a frame shape before you try anything on — starting from what's already on your face.",
    intro: "Frame shopping goes faster once you know roughly what you're looking for. The general principle is contrast: a frame that echoes the opposite of your face's dominant line tends to sit best.",
    sections: [
      {
        heading: "Round faces",
        body: "Soft curves benefit from a frame with some structure and straighter top lines — a rectangular or angular shape adds definition without looking severe. Avoid perfectly round frames, which tend to echo the face rather than balance it.",
      },
      {
        heading: "Square or angular faces",
        body: "Strong jawlines and a defined brow pair well with rounder or oval frames, which soften the face's straight lines. A frame with the same sharp angles as your jaw tends to double down on structure rather than balance it.",
      },
      {
        heading: "Oval faces",
        body: "This is the most forgiving shape — most frame styles work, so the deciding factor becomes proportion and colour rather than shape. Oversized frames and bold tortoiseshell both tend to suit an oval face without a specific caveat.",
      },
      {
        heading: "Heart-shaped faces",
        body: "A narrower jaw and wider brow are balanced by a frame that's wider at the bottom, or by lighter, rimless-adjacent styles that don't add extra width at the temple. Cat-eye shapes are a considered choice here — the upward line echoes the cheekbone rather than the brow.",
      },
      {
        heading: "What actually matters more than shape",
        body: "Frame width matters more than most guides admit — a frame narrower than your face reads awkward regardless of shape. Hold a frame up before trying it on: it should sit roughly at the width of your face at the temples, not narrower.",
      },
      {
        heading: "Trust the mirror over the rule",
        body: "These are starting points, not verdicts. The only real test is how a frame sits on your specific face in daylight — if a \"wrong for your shape\" frame still looks right on you, it is right for you.",
      },
    ],
  },
  {
    slug: "the-case-for-owning-fewer-accessories",
    title: "The case for owning three, not thirty",
    category: "Perspective",
    readTime: "4 min",
    excerpt: "Why a small, considered accessory edit tends to get worn more than a large, indifferent one.",
    intro: "It's easy to assume more choice means more style. In practice, a drawer of accessories bought on impulse mostly goes unworn, while three or four pieces chosen with intention get reached for constantly.",
    sections: [
      {
        heading: "Choice fatigue is real, even at this scale",
        body: "Faced with fifteen scarves in the morning, most people default to the same two or three anyway — the rest sit as a kind of visual clutter, adding decision cost without adding outfits actually worn. A smaller, considered edit removes the decision entirely.",
      },
      {
        heading: "Quality shows up faster in small pieces",
        body: "A scarf, bandana or pair of sunglasses sits close to the face, in direct view for the entire time it's worn — cut, drape and finish are more visible here than in almost anything else you own. A well-made piece worn often earns back its cost quickly; several mediocre ones rarely do.",
      },
      {
        heading: "Restraint ages better than trend-chasing",
        body: "A considered neutral or a well-chosen oxblood outlasts a trend colour bought for a single season. Building slowly around pieces that pair with what you already wear means nothing in the edit becomes dead weight a year later.",
      },
      {
        heading: "How to start small, on purpose",
        body: "Begin with one scarf or bandana in a tone that works with the three coats or jackets you already wear most, and one pair of sunglasses chosen for your face rather than for a photograph. Everything after that should answer a real gap, not fill a drawer.",
      },
    ],
  },
];

export function getJournalArticle(slug: string): JournalArticle | undefined {
  return journalArticles.find((article) => article.slug === slug);
}
