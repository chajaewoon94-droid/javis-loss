import { ExternalLink, PackageSearch, X } from "lucide-react";

const fmt = (value) => Number(value || 0).toLocaleString();

export default function ProductModal({ product, onClose }) {
  if (!product) return null;

  const name = product.productName || product.name || "상품 정보";
  const searchUrl =
    product.link ||
    product.productUrl ||
    product.naverLink ||
    `https://search.shopping.naver.com/search/all?query=${encodeURIComponent(name)}`;

  return (
    <div className="productOverlay" onMouseDown={(e) => e.target === e.currentTarget && onClose?.()}>
      <section className="productModal">
        <button className="productClose" type="button" onClick={onClose}><X size={18} /></button>
        <div className="productVisual">
          {product.imageUrl ? <img src={product.imageUrl} alt={name} /> : <PackageSearch size={54} />}
        </div>
        <div className="productInfo">
          <small>JAVIS PRODUCT INTELLIGENCE</small>
          <h2>{name}</h2>
          <p>{product.customer || "-"} · {product.productCode || product.code || "-"}</p>
          <div className="productStats">
            <div><span>판매가</span><strong>{product.price ? `${fmt(product.price)}원` : "-"}</strong></div>
            <div><span>누적 LOSS</span><strong>{fmt(product.lossQty || product.quantity)} EA</strong></div>
            <div><span>최근 LOT</span><strong>{product.lot || "-"}</strong></div>
            <div><span>로케이션</span><strong>{product.location || "-"}</strong></div>
          </div>
          <a href={searchUrl} target="_blank" rel="noopener noreferrer">
            네이버 상품 확인 <ExternalLink size={16} />
          </a>
        </div>
      </section>
    </div>
  );
}
