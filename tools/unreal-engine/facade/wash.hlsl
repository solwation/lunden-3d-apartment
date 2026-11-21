// Ten linear stops of the radial CanvasTexture in src/groundglow.js, applied to the original cut/draped triangles.
float r = saturate(length(UV * 2 - 1))*10, a = floor(r)/10, b = min(1,a+.1);
float falloff = lerp(round(255*pow(1-a,1.5)),round(255*pow(1-b,1.5)),frac(r))/255;
return float4($washColour * (falloff * Peak * WallLevel),1);
