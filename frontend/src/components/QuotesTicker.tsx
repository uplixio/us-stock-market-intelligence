'use client';

import { useState, useEffect, useRef } from 'react';

const QUOTES = [
  {
    text: 'Insanity is doing the same thing over and over again and expecting different results.',
    author: 'Albert Einstein',
    duration: 18000,
  },
  {
    text: 'In the short run, the market is a voting machine but in the long run, it is a weighing machine.',
    author: 'Benjamin Graham',
    duration: 7000,
  },
  {
    text: "It's only when the tide goes out that you learn who's been swimming naked.",
    author: 'Warren Buffett',
    duration: 7000,
  },
  {
    text: "Predicting rain doesn't count. Building arks does.",
    author: 'Warren Buffett',
    duration: 6000,
  },
  {
    text: 'I can calculate the motion of heavenly bodies, but not the madness of people.',
    author: 'Isaac Newton',
    duration: 7000,
  },
  {
    text: "History doesn't repeat itself, but it often rhymes.",
    author: 'Mark Twain',
    duration: 6000,
  },
  {
    text: 'Compound interest is the eighth wonder of the world. He who understands it, earns it; he who doesn\'t, pays it.',
    author: 'Albert Einstein',
    duration: 8000,
  },
  {
    text: 'Cut losses short. Ride winners. Keep bets small.',
    author: 'Ed Seykota',
    duration: 5000,
  },
  {
    text: 'At the stock exchange, 2+2 are never 4, but 5 minus 1.',
    author: 'Andre Kostolany',
    duration: 6000,
  },
  {
    text: 'Life is a tragedy when seen in close-up, but a comedy in long-shot.',
    author: 'Charlie Chaplin',
    duration: 7000,
  },
  {
    text: 'Knowing is not enough; we must apply. Willing is not enough; we must do.',
    author: 'Goethe',
    duration: 6000,
  },
  {
    text: 'What gets measured gets managed.',
    author: 'Peter Drucker',
    duration: 5000,
  },
  {
    text: 'Learn from yesterday, live for today, hope for tomorrow.',
    author: 'Albert Einstein',
    duration: 6000,
  },
  {
    text: 'The stock market and the economy are like a man walking his dog — the man walks slowly, the dog runs back and forth.',
    author: 'Andre Kostolany',
    duration: 8000,
  },
  {
    text: "If you don't bet the ranch, you can't lose the ranch.",
    author: 'Larry Hite',
    duration: 5000,
  },
];

export function QuotesTicker({ bar = false }: { bar?: boolean }) {
  const [current, setCurrent] = useState(0);
  const [visible, setVisible] = useState(true);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    const quote = QUOTES[current];

    timerRef.current = setTimeout(() => {
      setVisible(false);

      timerRef.current = setTimeout(() => {
        setCurrent((prev) => (prev + 1) % QUOTES.length);
        setVisible(true);
      }, 600);
    }, quote.duration);

    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, [current]);

  const quote = QUOTES[current];

  // 모바일용: 헤더 아래 fixed 바
  if (bar) {
    return (
      <div className="lg:hidden fixed top-16 z-40 w-full h-8 bg-surface-container-lowest/95 backdrop-blur border-b border-outline-variant/10 flex items-center justify-center overflow-hidden px-6">
        <div
          className={`transition-opacity duration-500 ${
            visible ? 'opacity-100' : 'opacity-0'
          }`}
        >
          <p className="text-[10px] text-on-surface/35 italic line-clamp-1">
            &ldquo;{quote.text}&rdquo; — {quote.author}
          </p>
        </div>
      </div>
    );
  }

  // 데스크탑용: 헤더 중앙 인라인
  return (
    <div className="hidden lg:flex flex-col items-center justify-center flex-1 min-w-0 px-8 overflow-hidden">
      <div
        className={`text-center transition-opacity duration-500 ${
          visible ? 'opacity-100' : 'opacity-0'
        }`}
      >
        <p className="text-[11px] text-on-surface/40 italic leading-tight line-clamp-1">
          &ldquo;{quote.text}&rdquo;
        </p>
        <p className="text-[10px] text-on-surface/25 mt-0.5 tracking-wide">
          — {quote.author}
        </p>
      </div>
    </div>
  );
}
