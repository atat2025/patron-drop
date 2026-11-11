export default function NotFound() {
  return (
    <>
      <script dangerouslySetInnerHTML={{ __html: "(function(){try{var R=[\"/\",\"/admin/\",\"/admin/pool/\",\"/bridge/\",\"/digitaltwin/\",\"/exchange/\",\"/lending/\",\"/leverage/\",\"/markets/\",\"/offerpad/\",\"/pat/\",\"/perp/\",\"/spot/\",\"/stocks/\",\"/twins/\",\"/vault/\",\"/vault-old/\"];var p=location.pathname;if(/\\.[a-z0-9]+$/i.test(p))return;var dir=p.endsWith(\"/\")?p:p+\"/\";if(R.indexOf(dir)<0)return;var q=location.search+location.hash,tried=sessionStorage.getItem(\"pr-404-tried\")||\"\";if(!p.endsWith(\"/\")&&tried.indexOf(\"|slash:\"+dir)<0){sessionStorage.setItem(\"pr-404-tried\",tried+\"|slash:\"+dir);location.replace(dir+q);return}if(tried.indexOf(\"|file:\"+dir)<0){sessionStorage.setItem(\"pr-404-tried\",tried+\"|file:\"+dir);location.replace(dir+\"index.html\"+q)}}catch(e){}})();" }} />
      <div style={{ fontFamily: "system-ui, Segoe UI, Roboto, Helvetica, Arial, sans-serif", height: "100vh", textAlign: "center", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center" }}>
        <div>
          <h1 className="next-error-h1" style={{ display: "inline-block", margin: "0 20px 0 0", padding: "0 23px 0 0", fontSize: 24, fontWeight: 500, verticalAlign: "top", lineHeight: "49px" }}>404</h1>
          <div style={{ display: "inline-block" }}><h2 style={{ fontSize: 14, fontWeight: 400, lineHeight: "49px", margin: 0 }}>This page could not be found.</h2></div>
        </div>
      </div>
    </>
  );
}
