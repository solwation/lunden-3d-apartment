using System.Diagnostics;
using System.Net;
using System.Security.Cryptography;
using System.Text.Json;
using Lunden.Launcher;

string work=Path.GetFullPath(args[0]);string stateRoot=Path.Combine(work,"install");
string signed=Path.GetFullPath(Path.Combine(work,"..","signed-release"));
var result=new Dictionary<string,object?> { ["completed"]=false,["passed"]=false,["gameStarted"]=false,["sourceCommit"]="84e35c47e5b358cea4eedc4e37d77fbd0cd42948" };
var timer=Stopwatch.StartNew();
void Write()=>File.WriteAllText(Path.Combine(work,"result.json"),JsonSerializer.Serialize(result,new JsonSerializerOptions{WriteIndented=true})+"\n");
string Hash(string p)=>Convert.ToHexString(SHA256.HashData(File.ReadAllBytes(p))).ToLowerInvariant();
Write();
try {
 result["sourceDllSHA256"]=Hash(typeof(ReleaseManifest).Assembly.Location);
 result["harnessDllSHA256"]=Hash(typeof(Program).Assembly.Location);
 string publicPem=Path.GetFullPath(Path.Combine(work,"..","official-manifest-public.pem"));
 result["officialPublicKeySHA256"]=Hash(publicPem);
 if (Hash(publicPem)!="2d03f1dc6fb5c7365dab1a5ece1738dfca2a408d6cbbb5b82be22ae09b4271ba")throw new Exception("Unexpected official public key");
 byte[] bytes=await File.ReadAllBytesAsync(Path.Combine(signed,"lunden-manifest-linux-x64-test.json"));
 byte[] signature=await File.ReadAllBytesAsync(Path.Combine(signed,"lunden-manifest-linux-x64-test.json.sig"));
 using var key=ECDsa.Create();key.ImportFromPem(await File.ReadAllTextAsync(publicPem));
 var manifest=ReleaseManifest.Read(bytes,signature,key,"test","linux-x64");
 var files=manifest.Files.ToArray();
 if (files.Length!=13||files.Sum(f=>f.Size)!=847641647||files.Any(f=>f.Url.Scheme!="https"))throw new Exception("Unexpected real release mapping");
 result["manifestSHA256"]=Convert.ToHexString(SHA256.HashData(bytes)).ToLowerInvariant();result["mappingCount"]=files.Length;result["mappedBytes"]=files.Sum(f=>f.Size);
 using var handler=new Requests();using var http=new HttpClient(handler){Timeout=TimeSpan.FromSeconds(20)};
 var store=new UpdateStore(stateRoot,http,(_,_,_)=>throw new Exception("Unexpected Windows publisher check on Linux"),"linux-x64");
 using var owner=store.Lock();
 string saved=Path.Combine(stateRoot,"Saved","production-install-preserve.sav");Directory.CreateDirectory(Path.GetDirectoryName(saved)!);
 byte[] sentinel=System.Text.Encoding.UTF8.GetBytes("#2422 actual production updater save preservation sentinel\n");await File.WriteAllBytesAsync(saved,sentinel);
 result["saveSentinel"]=saved;result["saveSentinelSHA256"]=Hash(saved);
 var before=store.Load("test");if(before.Active!=null)throw new Exception("Fresh production installation expected");
 Console.WriteLine("ACTUAL Apply begin "+DateTimeOffset.UtcNow.ToString("O"));
 var installed=await store.Apply(manifest,bytes,signature,before,false,CancellationToken.None);
 result["afterApply"]=store.Load("test");if(!store.Load("test").Pending)throw new Exception("Apply did not create pending active installation");
 string entry=await store.VerifyInstalled(installed,key,"test",CancellationToken.None);result["verifiedEntryPoint"]=entry;
 var rows=new List<object>();
 foreach(var f in files){string p=store.GameFile(installed,f.Path);string hash=Hash(p);long size=new FileInfo(p).Length;var mode=File.GetUnixFileMode(p);bool executable=mode.HasFlag(UnixFileMode.UserExecute);if(hash!=f.Sha256.ToLowerInvariant()||size!=f.Size||executable!=f.Executable)throw new Exception("Installed bytes/mode mismatch: "+f.Path);rows.Add(new{f.Path,size,sha256=hash,mode=mode.ToString(),manifestExecutable=f.Executable,actualUserExecute=executable});}
 result["installedFiles"]=rows;store.Confirm(store.Load("test"));var confirmed=store.Load("test");result["confirmedState"]=confirmed;
 if(confirmed.Pending||confirmed.Active!=installed)throw new Exception("Confirm state incorrect");
 int requestsBefore=handler.Rows.Count;
 var same=await store.Apply(manifest,bytes,signature,confirmed,false,CancellationToken.None);
 result["reapplySameReleaseNetworkRequests"]=handler.Rows.Count-requestsBefore;
 if(same!=installed||handler.Rows.Count!=requestsBefore||!(await File.ReadAllBytesAsync(saved)).SequenceEqual(sentinel))throw new Exception("Same release changed identity/network/saved data");
 if(!Path.GetFullPath(saved).StartsWith(stateRoot+Path.DirectorySeparatorChar)||Path.GetFullPath(saved).StartsWith(store.PathFor(installed)+Path.DirectorySeparatorChar))throw new Exception("Sentinel must remain outside version tree");
 result["sameReleasePreservesSavedSentinel"]=true;result["finalState"]=store.Load("test");result["httpRequests"]=handler.Rows;result["completed"]=true;result["passed"]=true;result["exitCode"]=0;
 Console.WriteLine("ACTUAL Apply+VerifyInstalled+Confirm+same-release preservation PASS");
} catch(Exception ex){result["error"]=ex.ToString();result["exitCode"]=1;Console.Error.WriteLine(ex);Environment.ExitCode=1;}
finally{timer.Stop();result["elapsedSeconds"]=timer.Elapsed.TotalSeconds;Write();}
sealed class Requests:DelegatingHandler {
 internal readonly List<object> Rows=[];
 internal Requests():base(new HttpClientHandler()){}
 protected override async Task<HttpResponseMessage> SendAsync(HttpRequestMessage request,CancellationToken ct){var response=await base.SendAsync(request,ct);Rows.Add(new{url=request.RequestUri!.ToString(),status=(int)response.StatusCode,range=request.Headers.Range?.ToString(),contentLength=response.Content.Headers.ContentLength});return response;}
}
