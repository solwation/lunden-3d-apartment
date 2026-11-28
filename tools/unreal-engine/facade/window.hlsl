// src/windowschedule.js and src/surroundings.js buildWindowLights.
float3 shifted = Hour + float3(-24,0,24);
float3 evening = min(smoothstep(0,1,(shifted-OnHour)/$fade+.5),smoothstep(0,1,(OffHour-shifted)/$fade+.5));
float3 morning = min(smoothstep(0,1,(shifted-Wake)/$fade+.5),smoothstep(0,1,(Leave-shifted)/$fade+.5));
float3 active = Home ? max(evening,Morning ? morning : 0) : 0;
float level = max(active.x,max(active.y,active.z));
float night = saturate(Night);
float k = Hall ? .85*night : level*(.25+.75*night);
if ((LocalPower > .5 && PowerAvailable <= .5) || k <= 0) return 0;
bool tv = !Hall && Rate>0 && (Hour >= $tvFrom || Hour < $tvUntil-24) && level>.5;
float3 rgb = Hall ? float3(1,.84,.6) : tv ? $tvColour : float3(LampR,LampG,LampB);
if (tv) {
    float sec = floor(Seconds/$tvStep)*$tvStep;
    uint hash = 2166136261u, millis = (uint)PhaseMillis;
    // The web FNV-1a keys are "cut:phase" with exactly three decimal places on the phase.
    [unroll] for (uint field=0; field<2; ++field) {
        uint value = field==0 ? (uint)floor(sec*Rate+Phase) : millis/1000u;
        uint place=1;
        [loop] while(value/place>=10u && place<1000000000u) place*=10u;
        [loop] while(place>0u) {
            hash=(hash^(48u+value/place%10u))*16777619u;
            place/=10u;
        }
        hash=(hash^(field==0 ? 58u : 46u))*16777619u;
    }
    [unroll] for(uint place=100u; place>0u; place/=10u) hash=(hash^(48u+millis/place%10u))*16777619u;
    uint state=hash+0x6d2b79f5u, bits=(state^(state>>15))*(1u|state);
    bits=(bits+(bits^(bits>>7))*(61u|bits))^bits;
    float cut=float(bits^(bits>>14))/4294967296.0;
    float wave=.5+.5*sin(sec*7.3+Phase)*sin(sec*2.1+Phase*1.7);
    k *= 1-$tvDepth*(.65*cut+.35*wave);
}
float2 uv = saturate(float2(dot(PositionWS.xy-float2(Cx,Cy),float2(Ny,-Nx))/Width+.5,(PositionWS.z-Cz)/Height+.5));
float gs = GlowSeed, gx = uv.x, gy = uv.y;
float lampX = .25+.5*frac(gs*7.1), dx=(gx-lampX)*1.6, dy=(gy-.92)*1.1;
float gl = ($glowBase+$glowLamp*exp(-3*(dx*dx+dy*dy))) * lerp($glowFloor,1,smoothstep(0,.35,gy));
if (gs < .3) {
    float c = .12+.3*frac(gs*13);
    gl *= lerp($glowCurtain,1,smoothstep(c-.03,c,min(gx,1-gx)));
} else if (gs < .55) {
    float d = .2+.7*frac(gs*11);
    gl *= lerp($glowCurtain+.3*smoothstep(.1,.4,frac(gy*18)),1,smoothstep(d-.02,d,1-gy));
}
return float4(rgb*k*gl,1);
