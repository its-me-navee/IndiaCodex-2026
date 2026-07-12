import { ArrowLeft, Compass } from "lucide-react";
import { Link } from "react-router-dom";

export function NotFoundPage() {
  return <div className="grid min-h-[620px] place-items-center px-5 text-center"><div><Compass className="mx-auto size-12 text-lime" /><span className="eyebrow mt-5">404 / no state</span><h1 className="page-title">This market path does not exist.</h1><p className="mt-2 text-sm text-muted">Return to the public directory and load a confirmed state.</p><Link to="/markets" className="button primary mt-6"><ArrowLeft size={16} /> Back to markets</Link></div></div>;
}
