import { useEffect, useRef, useState } from 'react';
import { listingIllustrations } from './illustrations';

export function StayGallery({ listingId }: { listingId: string }) {
  const images = listingIllustrations(listingId);
  const [active, setActive] = useState<number | null>(null);
  const dialog = useRef<HTMLDialogElement>(null);
  const opener = useRef<HTMLElement | null>(null);
  const touchStart = useRef<number | null>(null);
  const open = (index: number, target: HTMLElement) => { opener.current = target; setActive(index); };
  const close = () => { dialog.current?.close(); setActive(null); opener.current?.focus(); };
  const move = (offset: number) => setActive(value => value === null ? null : (value + offset + images.length) % images.length);
  const isOpen = active !== null;
  useEffect(() => {
    if (!isOpen) return;
    dialog.current?.showModal();
    const overflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => { document.body.style.overflow = overflow; };
  }, [isOpen]);
  return <section className="stay-gallery" aria-label="Stay inspiration illustrations">
    <div className="gallery-mosaic">{images.map((art, index) => <button className={`gallery-tile gallery-tile-${index}`} type="button" key={art.src} aria-label={`Open illustration ${index + 1}`} onClick={event => open(index, event.currentTarget)}><img src={art.src} alt={art.alt} width="1536" height="1024" /><span>{art.title}</span></button>)}
      <button className="gallery-all" type="button" onClick={event => open(0, event.currentTarget)}><span aria-hidden="true">▦</span> View all illustrations</button>
    </div>
    <p className="imagery-note">Travel-inspired illustrations · Property photos are not available. These images do not depict this stay or its surroundings.</p>
    {active !== null && <dialog ref={dialog} className="gallery-dialog" aria-labelledby="gallery-title" onCancel={event => { event.preventDefault(); close(); }} onKeyDown={event => {
      if (event.key === 'Escape') { event.preventDefault(); close(); }
      if (event.key === 'ArrowRight') { event.preventDefault(); move(1); }
      if (event.key === 'ArrowLeft') { event.preventDefault(); move(-1); }
    }}>
      <header><div><h2 id="gallery-title">Stay inspiration</h2><p>Illustrations, not property photos</p></div><button type="button" className="gallery-close" aria-label="Close gallery" onClick={close}>✕</button></header>
      <figure onTouchStart={event => { touchStart.current = event.touches[0]?.clientX ?? null; }} onTouchEnd={event => {
        const end = event.changedTouches[0]?.clientX;
        if (touchStart.current !== null && end !== undefined && Math.abs(end - touchStart.current) > 50) move(end < touchStart.current ? 1 : -1);
        touchStart.current = null;
      }}>
        <img src={images[active]!.src} alt={images[active]!.alt} />
        <figcaption aria-live="polite">{images[active]!.title} · {active + 1} / {images.length}</figcaption>
      </figure>
      <nav aria-label="Gallery navigation"><button type="button" onClick={() => move(-1)} aria-label="Previous illustration">←</button><span>Use arrow keys or swipe to explore</span><button type="button" onClick={() => move(1)} aria-label="Next illustration">→</button></nav>
    </dialog>}
  </section>;
}
