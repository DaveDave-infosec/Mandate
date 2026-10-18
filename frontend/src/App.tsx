import { useEffect } from "react";
import { BrowserRouter, Route, Routes, useLocation } from "react-router-dom";
import { ConsolePage } from "./pages/Console";
import Home from "./pages/Home";
import HowItWorks from "./pages/HowItWorks";
import Guide from "./pages/Guide";
import Nav from "./components/Nav";
import Footer from "./components/Footer";

function ScrollToTop() {
  const { pathname } = useLocation();
  useEffect(() => {
    window.scrollTo(0, 0);
  }, [pathname]);
  return null;
}

function Shell() {
  return (
    <>
      <ScrollToTop />
      <Nav />
      <Routes>
        <Route path="/" element={<Home />} />
        <Route
          path="/console"
          element={
            <>
              <ConsolePage />
              <Footer />
            </>
          }
        />
        <Route path="/how-it-works" element={<HowItWorks />} />
        <Route path="/guide" element={<Guide />} />
        <Route path="*" element={<Home />} />
      </Routes>
    </>
  );
}

export default function App() {
  return (
    <BrowserRouter>
      <Shell />
    </BrowserRouter>
  );
}
