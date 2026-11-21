// src/interiormap.js roomColour. Unreal positions in cm; ray and hit distances below in metres.
float3 hashes = frac(Seed * float3(91.7,31.1,17.3) * .1031);
hashes *= hashes + 33.33;
hashes = frac(hashes * (hashes + hashes));
float3 n = float3(Nx, Ny, 0), t = float3(Ny, -Nx, 0);
float3 ray = -normalize(ViewDir);
float rd = -dot(ray, n);
if (rd < .03) return 0;
float3 p = (PositionWS - float3(Cx,Cy,Cz)) * .01;
float l = dot(p,t), v = p.z, rl = dot(ray,t), rv = ray.z;
rl = abs(rl) < 1e-4 ? 1e-4 : rl;
rv = abs(rv) < 1e-4 ? 1e-4 : rv;
float tl = ((rl > 0 ? Right : Left) - l) / rl, tv = ((rv > 0 ? Ceiling : FloorZ) - v) / rv;
float td = Depth / rd, hit = min(td,min(tl,tv));
float3 wall = float3(WallR,WallG,WallB), fab = float3(FabricR,FabricG,FabricB), alb = wall * .85;
if (hit == td) {
    alb = wall;
    float fx = l + rl * hit - lerp(Left,Right,.2 + .6 * hashes.x);
    if (abs(fx) < .35 + .3 * hashes.y && v + rv * hit < FloorZ + .55 + .9 * hashes.z) alb *= .4;
} else if (hit == tv) alb = rv < 0 ? float3(FloorR,FloorG,FloorB) : wall * 1.15;
float night = saturate(Night), fabricLevel = lerp($fabricDay,$fabricNight,night);
float3 room = alb * lerp($roomDay,$roomNight,night) * (.35 + .65 * exp(-rd * hit * .38));
float drop = (HalfH - v) / (2 * HalfH), cm = 0;
float3 cloth = fab * fabricLevel;
if (Kind > 3.5) {
    cm = 1 - smoothstep(Cover-.01,Cover,drop);
    cloth = lerp(fab,.8,.55) * fabricLevel * (1 - .35 * smoothstep(Cover-.04,Cover-.01,drop));
} else if (Kind > 2.5) {
    cm = .55 + .1 * sin(l * 14 + Seed * 30);
    cloth = float3(.86,.85,.8) * fabricLevel;
} else if (Kind > 1.5) {
    float slat = frac(v * 30);
    cm = (1 - smoothstep(Cover-.01,Cover,drop)) * lerp(.3,1,smoothstep(.05,.25,slat));
    cloth = lerp(fab,.85,.6) * fabricLevel * (.8 + .2 * slat);
} else if (Kind > .5) {
    float width = Cover * 2 * HalfW;
    cm = 1 - smoothstep(width-.03,width,HalfW-abs(l));
    cloth *= .72 + .28 * sin(l * 22 + Seed * 40);
}
float alpha = $strength * (1 - pow(1 - saturate(rd),3));
float3 emissive = DuskLit && night > $duskOn && PowerAvailable > .5 ? $windowColour * $windowIntensity : 0;
// Unlit translucent output is alpha-blended with the original reflecting pane. Preserve its additive lamp term.
return float4(lerp(room,cloth,cm) + emissive / max(alpha,1e-5),alpha);
