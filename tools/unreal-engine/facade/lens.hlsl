// Hus L uses a direct dusk threshold; the A/B/C loggias use the wall-light latch.
bool lit = Direct ? (Night > $duskOn && PowerAvailable > .5) : WallOn > .5;
return float4(lit ? $lensOn : $lensOff,1);
