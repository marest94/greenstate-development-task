export const illustrations = [
  { src: '/images/courtyard.jpg', alt: 'Illustration of a sunlit Mediterranean courtyard', title: 'A little room to slow down' },
  { src: '/images/townhouse.jpg', alt: 'Illustration of a leafy European street', title: 'A new corner to discover' },
  { src: '/images/alpine.jpg', alt: 'Illustration of a quiet lake in the mountains', title: 'Somewhere closer to nature' },
];

// Stable artwork selection; illustrations do not describe the property's location or amenities.
export function listingIllustrations(id: string) {
  const offset = [...id].reduce((sum, letter) => sum + letter.charCodeAt(0), 0) % illustrations.length;
  return [...illustrations.slice(offset), ...illustrations.slice(0, offset)];
}
