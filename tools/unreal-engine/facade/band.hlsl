// #2430: the courtyard bollards' band under the cap (src/courtyard.js): lit strictly above the dusk threshold with power.
return float4(Night > On && PowerAvailable > .5 ? float3(LitR,LitG,LitB) : float3(OffR,OffG,OffB),1);
