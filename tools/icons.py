"""Génère les icônes de l'appli (torii vermillon sur papier washi). Aucune donnée personnelle."""
from PIL import Image, ImageDraw
import os, sys

FOND = (246, 241, 231)
SHU = (200, 67, 43)
ENCRE = (35, 38, 44)

def torii(size, marge):
    img = Image.new("RGB", (size, size), FOND)
    d = ImageDraw.Draw(img)
    s = size - 2 * marge
    def X(v): return marge + v * s
    def Y(v): return marge + v * s
    # Soleil discret derrière le torii
    r = 0.30 * s
    cx, cy = X(0.5), Y(0.42)
    d.ellipse([cx - r, cy - r, cx + r, cy + r], fill=(243, 217, 210))
    # Kasagi (poutre haute, légèrement relevée aux extrémités)
    d.polygon([(X(0.06), Y(0.20)), (X(0.94), Y(0.20)), (X(0.98), Y(0.14)), (X(0.90), Y(0.27)), (X(0.10), Y(0.27)), (X(0.02), Y(0.14))], fill=ENCRE)
    d.rectangle([X(0.12), Y(0.27), X(0.88), Y(0.33)], fill=SHU)
    # Nuki (poutre basse)
    d.rectangle([X(0.14), Y(0.44), X(0.86), Y(0.50)], fill=SHU)
    # Gakuzuka (petit montant central)
    d.rectangle([X(0.465), Y(0.33), X(0.535), Y(0.44)], fill=SHU)
    # Piliers légèrement inclinés
    d.polygon([(X(0.24), Y(0.33)), (X(0.32), Y(0.33)), (X(0.34), Y(0.90)), (X(0.22), Y(0.90))], fill=SHU)
    d.polygon([(X(0.68), Y(0.33)), (X(0.76), Y(0.33)), (X(0.78), Y(0.90)), (X(0.66), Y(0.90))], fill=SHU)
    # Socles
    d.rectangle([X(0.20), Y(0.88), X(0.36), Y(0.93)], fill=ENCRE)
    d.rectangle([X(0.64), Y(0.88), X(0.80), Y(0.93)], fill=ENCRE)
    return img

out = sys.argv[1] if len(sys.argv) > 1 else "app"
for nom, taille, marge in [("icon-180.png", 180, 22), ("icon-192.png", 192, 24), ("icon-512.png", 512, 64), ("icon-maskable-512.png", 512, 118)]:
    torii(taille, marge).save(os.path.join(out, nom), optimize=True)
print("Icônes générées dans", out)
