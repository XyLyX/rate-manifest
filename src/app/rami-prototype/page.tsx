import type { Metadata } from 'next';
import Experience from './experience';
export const metadata: Metadata = { title: 'RaMi | Experience prototype', robots: { index: false, follow: false }, alternates: { canonical: '/rami-prototype' } };
export default function Page() { return <Experience />; }
