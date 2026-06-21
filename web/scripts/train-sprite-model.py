#!/usr/bin/env python3
"""
Trainable Sprite Autoencoder — learns visual structure from pixel sprite data.

This script trains a convolutional autoencoder on the pixel_character_generator
dataset (64x64 RGBA sprites). The model learns to encode sprite structure into
a compact latent vector and decode it back, capturing:
  - Body outlines and silhouettes
  - Material boundaries (skin, armor, cloth)
  - Symmetry patterns
  - Common sprite archetypes

After training, the model is exported to ONNX format for use in-browser
via ONNX Runtime Web.

Usage:
  pip install torch torchvision pillow numpy onnx
  python scripts/train-sprite-model.py

The sprite dataset should be at: public/sprites/pixel-chars/data/
Each subdirectory contains 64x64 PNG sprite images.
"""

import os
import sys
import glob
import numpy as np
from pathlib import Path

try:
    import torch
    import torch.nn as nn
    import torch.optim as optim
    from torch.utils.data import Dataset, DataLoader
    from PIL import Image
except ImportError:
    print("Required packages not installed. Run:")
    print("  pip install torch torchvision pillow numpy onnx")
    sys.exit(1)


# --- Configuration ---

SPRITE_DIR = os.path.join(os.path.dirname(__file__), "..", "public", "sprites", "pixel-chars", "data")
OUTPUT_DIR = os.path.join(os.path.dirname(__file__), "..", "public", "models")
LATENT_DIM = 32
BATCH_SIZE = 32
EPOCHS = 50
LEARNING_RATE = 1e-3
IMAGE_SIZE = 64  # 64x64 sprites
CHANNELS = 4  # RGBA


# --- Dataset ---

class SpriteDataset(Dataset):
    """Load all PNG sprites from the pixel-chars dataset."""

    def __init__(self, root_dir: str, image_size: int = 64):
        self.image_size = image_size
        self.image_paths = []

        # Scan all subdirectories for PNG files
        for ext in ["*.png", "*.PNG"]:
            self.image_paths.extend(glob.glob(os.path.join(root_dir, "**", ext), recursive=True))

        if not self.image_paths:
            raise ValueError(f"No PNG files found in {root_dir}")

        print(f"Found {len(self.image_paths)} sprite images")

    def __len__(self):
        return len(self.image_paths)

    def __getitem__(self, idx):
        img_path = self.image_paths[idx]
        img = Image.open(img_path).convert("RGBA")
        img = img.resize((self.image_size, self.image_size), Image.Resampling.NEAREST)

        # Convert to float tensor [0, 1]
        arr = np.array(img, dtype=np.float32) / 255.0
        # (H, W, C) -> (C, H, W)
        tensor = torch.from_numpy(arr).permute(2, 0, 1)
        return tensor


# --- Model ---

class SpriteEncoder(nn.Module):
    """Convolutional encoder: 64x64x4 -> latent vector."""

    def __init__(self, latent_dim: int = 32):
        super().__init__()
        self.conv = nn.Sequential(
            # 64x64x4 -> 32x32x32
            nn.Conv2d(CHANNELS, 32, 4, stride=2, padding=1),
            nn.BatchNorm2d(32),
            nn.ReLU(),
            # 32x32x32 -> 16x16x64
            nn.Conv2d(32, 64, 4, stride=2, padding=1),
            nn.BatchNorm2d(64),
            nn.ReLU(),
            # 16x16x64 -> 8x8x128
            nn.Conv2d(64, 128, 4, stride=2, padding=1),
            nn.BatchNorm2d(128),
            nn.ReLU(),
            # 8x8x128 -> 4x4x256
            nn.Conv2d(128, 256, 4, stride=2, padding=1),
            nn.BatchNorm2d(256),
            nn.ReLU(),
        )
        self.fc = nn.Linear(256 * 4 * 4, latent_dim)

    def forward(self, x):
        h = self.conv(x)
        h = h.view(h.size(0), -1)
        return self.fc(h)


class SpriteDecoder(nn.Module):
    """Convolutional decoder: latent vector -> 64x64x4."""

    def __init__(self, latent_dim: int = 32):
        super().__init__()
        self.fc = nn.Linear(latent_dim, 256 * 4 * 4)
        self.deconv = nn.Sequential(
            # 4x4x256 -> 8x8x128
            nn.ConvTranspose2d(256, 128, 4, stride=2, padding=1),
            nn.BatchNorm2d(128),
            nn.ReLU(),
            # 8x8x128 -> 16x16x64
            nn.ConvTranspose2d(128, 64, 4, stride=2, padding=1),
            nn.BatchNorm2d(64),
            nn.ReLU(),
            # 16x16x64 -> 32x32x32
            nn.ConvTranspose2d(64, 32, 4, stride=2, padding=1),
            nn.BatchNorm2d(32),
            nn.ReLU(),
            # 32x32x32 -> 64x64x4
            nn.ConvTranspose2d(32, CHANNELS, 4, stride=2, padding=1),
            nn.Sigmoid(),  # Output in [0, 1]
        )

    def forward(self, z):
        h = self.fc(z)
        h = h.view(h.size(0), 256, 4, 4)
        return self.deconv(h)


class SpriteAutoencoder(nn.Module):
    """Full autoencoder: encoder + decoder."""

    def __init__(self, latent_dim: int = 32):
        super().__init__()
        self.encoder = SpriteEncoder(latent_dim)
        self.decoder = SpriteDecoder(latent_dim)

    def forward(self, x):
        z = self.encoder(x)
        return self.decoder(z)

    def encode(self, x):
        return self.encoder(x)

    def decode(self, z):
        return self.decoder(z)


# --- Training ---

def train():
    print(f"Sprite Autoencoder Training")
    print(f"  Sprite directory: {SPRITE_DIR}")
    print(f"  Latent dimension: {LATENT_DIM}")
    print(f"  Image size: {IMAGE_SIZE}x{IMAGE_SIZE}")
    print(f"  Epochs: {EPOCHS}")
    print()

    # Check sprite directory
    if not os.path.exists(SPRITE_DIR):
        print(f"ERROR: Sprite directory not found: {SPRITE_DIR}")
        print("  Make sure pixel-chars dataset is at public/sprites/pixel-chars/data/")
        sys.exit(1)

    # Load dataset
    dataset = SpriteDataset(SPRITE_DIR, IMAGE_SIZE)
    dataloader = DataLoader(dataset, batch_size=BATCH_SIZE, shuffle=True, num_workers=0)

    # Select device
    device = torch.device("cuda" if torch.cuda.is_available() else "mps" if torch.backends.mps.is_available() else "cpu")
    print(f"  Device: {device}")
    print()

    # Create model
    model = SpriteAutoencoder(LATENT_DIM).to(device)
    optimizer = optim.Adam(model.parameters(), lr=LEARNING_RATE)
    criterion = nn.MSELoss()

    # Count parameters
    total_params = sum(p.numel() for p in model.parameters())
    print(f"  Model parameters: {total_params:,}")
    print()

    # Training loop
    for epoch in range(EPOCHS):
        model.train()
        total_loss = 0
        batch_count = 0

        for batch in dataloader:
            batch = batch.to(device)
            optimizer.zero_grad()

            output = model(batch)
            loss = criterion(output, batch)

            # Add alpha-aware loss: penalize more on visible pixels
            alpha_mask = batch[:, 3:4, :, :]  # Alpha channel
            visible_loss = criterion(output * alpha_mask, batch * alpha_mask)
            combined_loss = loss + 0.5 * visible_loss

            combined_loss.backward()
            optimizer.step()

            total_loss += combined_loss.item()
            batch_count += 1

        avg_loss = total_loss / max(batch_count, 1)
        if (epoch + 1) % 5 == 0 or epoch == 0:
            print(f"  Epoch {epoch + 1:3d}/{EPOCHS}  loss={avg_loss:.6f}")

    print()
    print("Training complete.")

    # Save PyTorch model
    os.makedirs(OUTPUT_DIR, exist_ok=True)
    torch_path = os.path.join(OUTPUT_DIR, "sprite-autoencoder.pt")
    torch.save({
        "model_state_dict": model.state_dict(),
        "latent_dim": LATENT_DIM,
        "image_size": IMAGE_SIZE,
        "channels": CHANNELS,
    }, torch_path)
    print(f"  PyTorch model saved: {torch_path}")

    # Export to ONNX
    export_onnx(model, device)


def export_onnx(model, device):
    """Export the trained model to ONNX format for browser inference."""
    try:
        import onnx
    except ImportError:
        print("  ONNX export skipped (install onnx: pip install onnx)")
        return

    model.eval()
    onnx_path = os.path.join(OUTPUT_DIR, "sprite-autoencoder.onnx")

    # Export full autoencoder
    dummy_input = torch.randn(1, CHANNELS, IMAGE_SIZE, IMAGE_SIZE).to(device)
    torch.onnx.export(
        model,
        dummy_input,
        onnx_path,
        input_names=["sprite"],
        output_names=["reconstruction"],
        dynamic_axes={
            "sprite": {0: "batch"},
            "reconstruction": {0: "batch"},
        },
        opset_version=14,
    )
    print(f"  ONNX model saved: {onnx_path}")

    # Also export encoder-only for latent analysis
    encoder_path = os.path.join(OUTPUT_DIR, "sprite-encoder.onnx")
    torch.onnx.export(
        model.encoder,
        dummy_input,
        encoder_path,
        input_names=["sprite"],
        output_names=["latent"],
        dynamic_axes={
            "sprite": {0: "batch"},
            "latent": {0: "batch"},
        },
        opset_version=14,
    )
    print(f"  ONNX encoder saved: {encoder_path}")

    # Verify
    onnx_model = onnx.load(onnx_path)
    onnx.checker.check_model(onnx_model)
    print("  ONNX model verified successfully")

    # Print model size
    size_mb = os.path.getsize(onnx_path) / (1024 * 1024)
    print(f"  Model size: {size_mb:.2f} MB")


if __name__ == "__main__":
    train()
