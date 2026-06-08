"""
loan_model.py와 loan_inference_server.py가 공유하는 PyTorch 모델 클래스.
joblib pickle 역직렬화 시 두 쪽 모두에서 이 모듈을 import해야 합니다.
"""

import numpy as np
import torch
import torch.nn as nn
from sklearn.preprocessing import StandardScaler


class LoanMLP(nn.Module):
    def __init__(self, n_features: int):
        super().__init__()
        self.net = nn.Sequential(
            nn.Linear(n_features, 256),
            nn.BatchNorm1d(256),
            nn.ReLU(),
            nn.Dropout(0.3),
            nn.Linear(256, 128),
            nn.BatchNorm1d(128),
            nn.ReLU(),
            nn.Dropout(0.2),
            nn.Linear(128, 64),
            nn.BatchNorm1d(64),
            nn.ReLU(),
            nn.Linear(64, 1),
        )

    def forward(self, x: torch.Tensor) -> torch.Tensor:
        return self.net(x).squeeze(-1)


class TorchLoanWrapper:
    """sklearn predict_proba 인터페이스 호환 래퍼 (추론 서버 변경 불필요)"""

    def __init__(self, mlp: LoanMLP, scaler: StandardScaler, features: list[str], device: torch.device):
        self.mlp = mlp.cpu()
        self.scaler = scaler
        self.features = features
        self._device = device

    def predict_proba(self, df) -> np.ndarray:
        import pandas as pd
        self.mlp = self.mlp.cpu()  # pkl이 GPU로 저장된 경우 대비
        self.mlp.eval()
        df_feat = pd.DataFrame(df[self.features].values, columns=self.features)
        X = self.scaler.transform(df_feat).astype(np.float32)
        with torch.no_grad():
            probs = torch.sigmoid(self.mlp(torch.tensor(X))).numpy()
        return np.column_stack([1.0 - probs, probs])
