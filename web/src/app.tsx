import { useEffect, useState } from 'preact/hooks';
import { BASE } from './config';
import { wakeServer } from './chain';
import { PayScreen } from './screens/pay';
import { ClaimScreen } from './screens/claim';
import { WalletScreen } from './screens/wallet';
import { ChatScreen } from './screens/chat';
import { ShopScreen } from './screens/shop';
import { counter } from './counter';

export type Route = 'pay' | 'claim' | 'wallet' | 'chat' | 'shop';

export function routeOf(pathname: string): Route {
  const p = pathname.startsWith(BASE) ? pathname.slice(BASE.length) : pathname.replace(/^\//, '');
  const head = p.split('/')[0] ?? '';
  if (head === 'c') return 'claim';
  if (head === 'w') return 'wallet';
  if (head === 'chat') return 'chat';
  if (head === 'shop') return 'shop';
  return 'pay';
}

export const href = (r: Route) => BASE + (r === 'pay' ? '' : r === 'claim' ? 'c' : r === 'wallet' ? 'w' : r);

export function go(r: Route) {
  history.pushState(null, '', href(r));
  dispatchEvent(new PopStateEvent('popstate'));
}

export function App() {
  const [route, setRoute] = useState<Route>(routeOf(location.pathname));
  const [count, setCount] = useState(counter.value);
  useEffect(() => {
    wakeServer();
    const on = () => setRoute(routeOf(location.pathname));
    addEventListener('popstate', on);
    const off = counter.subscribe(setCount);
    return () => {
      removeEventListener('popstate', on);
      off();
    };
  }, []);
  const tab = (r: Route, label: string) => (
    <a
      href={href(r)}
      aria-current={route === r ? 'page' : undefined}
      onClick={(e) => {
        e.preventDefault();
        go(r);
      }}
    >
      {label}
    </a>
  );
  return (
    <>
      {counter.visible && <div class="counter" aria-live="polite">{count} actions</div>}
      <div class="top">
        <span class="brand">Tok</span>
        <span class="net">devnet, test money</span>
      </div>
      {route === 'pay' && <PayScreen />}
      {route === 'claim' && <ClaimScreen />}
      {route === 'wallet' && <WalletScreen />}
      {route === 'chat' && <ChatScreen />}
      {route === 'shop' && <ShopScreen />}
      {route !== 'claim' && (
        <nav class="tabs">
          {tab('pay', 'Pay')}
          {tab('chat', 'Chat')}
          {tab('shop', 'Shop')}
          {tab('wallet', 'Wallet')}
        </nav>
      )}
    </>
  );
}
