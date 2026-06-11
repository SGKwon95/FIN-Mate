"""
loan_model.pkl → loan_model.onnx + loan_model_meta.json 변환 스크립트
실행: python export_onnx.py
"""

import json
import joblib
import numpy as np
import torch
import torch.nn as nn

from loan_model_wrapper import LoanMLP, TorchLoanWrapper  # noqa: F401


class FullPipeline(nn.Module):
    """StandardScaler + LoanMLP + sigmoid 를 하나의 ONNX 그래프로 통합"""

    def __init__(self, mlp: LoanMLP, scaler_mean: np.ndarray, scaler_scale: np.ndarray):
        super().__init__()
        self.mlp = mlp
        self.register_buffer("mean",  torch.tensor(scaler_mean,  dtype=torch.float32))
        self.register_buffer("scale", torch.tensor(scaler_scale, dtype=torch.float32))

    def forward(self, x: torch.Tensor) -> torch.Tensor:
        x_scaled = (x - self.mean) / self.scale
        logits = self.mlp(x_scaled)
        return torch.sigmoid(logits)


def main() -> None:
    artifact = joblib.load("loan_model.pkl")
    wrapper: TorchLoanWrapper = artifact["model"]
    threshold: float = float(artifact["threshold"])
    features: list[str] = artifact["features"]
    cat_maps: dict = artifact.get("category_maps", {})

    pipeline = FullPipeline(
        wrapper.mlp.cpu().eval(),
        wrapper.scaler.mean_,
        wrapper.scaler.scale_,
    )
    pipeline.eval()

    n_features = len(features)
    dummy = torch.zeros(1, n_features, dtype=torch.float32)

    torch.onnx.export(
        pipeline,
        dummy,
        "loan_model.onnx",
        input_names=["features"],
        output_names=["probability"],
        dynamic_axes={"features": {0: "batch"}, "probability": {0: "batch"}},
        opset_version=17,
    )
    print("loan_model.onnx 생성 완료")

    # Node.js 에서 사용할 메타데이터 저장
    meta = {
        "features": features,
        "threshold": threshold,
        "category_maps": {col: {str(k): int(v) for k, v in m.items()} for col, m in cat_maps.items()},
    }
    with open("loan_model_meta.json", "w", encoding="utf-8") as f:
        json.dump(meta, f, ensure_ascii=False, indent=2)
    print("loan_model_meta.json 생성 완료")
    print(f"  피처 수: {n_features}")
    print(f"  임계값: {threshold:.4f}")
    print(f"  카테고리 매핑: {list(cat_maps.keys())}")


if __name__ == "__main__":
    main()
