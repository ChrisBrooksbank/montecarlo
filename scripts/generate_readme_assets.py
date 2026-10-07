"""Regenerate README visuals: pip install numpy matplotlib pillow && python scripts/generate_readme_assets.py"""
import numpy as np, matplotlib
matplotlib.use("Agg")
import matplotlib.pyplot as plt
from matplotlib.patches import FancyArrowPatch, Circle
from PIL import Image
import io
import os
OUT=os.path.join(os.path.dirname(os.path.abspath(__file__)),"..","docs","assets")
os.makedirs(OUT,exist_ok=True)
BG="#0b0b1a"; IN="#ff3cac"; OUTC="#2bd2ff"; GOLD="#ffd166"; TXT="#e8e8ff"
plt.rcParams.update({"font.family":"DejaVu Sans","text.color":TXT,"axes.labelcolor":TXT,"xtick.color":TXT,"ytick.color":TXT})
rng=np.random.default_rng(1946)

# --- GIF: darts estimating pi
N=6000; pts=rng.random((N,2)); inside=(pts**2).sum(1)<=1
frames=[]; counts=np.unique(np.round(np.geomspace(5,N,60)).astype(int))
for n in list(counts)+[N]*12:
    fig=plt.figure(figsize=(5,5.6),dpi=80,facecolor=BG)
    ax=fig.add_axes([0.06,0.04,0.88,0.79]); ax.set_facecolor(BG)
    p=pts[:n]; m=inside[:n]
    ax.scatter(p[~m,0],p[~m,1],s=3,c=OUTC,alpha=.85,lw=0)
    ax.scatter(p[m,0],p[m,1],s=3,c=IN,alpha=.85,lw=0)
    t=np.linspace(0,np.pi/2,200); ax.plot(np.cos(t),np.sin(t),c=GOLD,lw=2)
    ax.set_xlim(0,1); ax.set_ylim(0,1); ax.set_aspect("equal"); ax.axis("off")
    est=4*m.sum()/n
    fig.text(.5,.93,f"π ≈ {est:.5f}",ha="center",fontsize=24,weight="bold",color=GOLD)
    fig.text(.5,.86,f"{n:,} darts  ·  error {abs(est-np.pi):.4f}",ha="center",fontsize=12,color=TXT)
    buf=io.BytesIO(); fig.savefig(buf,format="png",facecolor=BG); plt.close(fig)
    frames.append(Image.open(buf).convert("P",palette=Image.ADAPTIVE,colors=64))
frames[0].save(f"{OUT}/pi-darts.gif",save_all=True,append_images=frames[1:],duration=90,loop=0,optimize=True)

# --- PNG: convergence of many runs vs 1/sqrt(N)
fig,ax=plt.subplots(figsize=(9,4.5),dpi=110,facecolor=BG); ax.set_facecolor(BG)
M=200000; n=np.arange(1,M+1)
for k in range(12):
    d=(rng.random((M,2))**2).sum(1)<=1
    ax.plot(n,np.abs(4*np.cumsum(d)/n-np.pi)+1e-9,lw=.8,alpha=.55,color=[IN,OUTC,"#9b5de5"][k%3])
ax.plot(n,1.64/np.sqrt(n),c=GOLD,lw=2.5,label=r"$\sim 1/\sqrt{N}$")
ax.set_xscale("log"); ax.set_yscale("log"); ax.set_xlim(10,M); ax.set_ylim(1e-5,2)
ax.set_xlabel("darts thrown (N)"); ax.set_ylabel("|estimate − π|")
ax.set_title("12 universes, one law: the error melts like 1/√N",color=TXT,fontsize=14,weight="bold")
for s in ax.spines.values(): s.set_color("#333355")
ax.legend(facecolor=BG,edgecolor="#333355",labelcolor=TXT,fontsize=12); ax.grid(alpha=.15)
fig.tight_layout(); fig.savefig(f"{OUT}/convergence.png",facecolor=BG); plt.close(fig)

# --- PNG: Markov weather chain + convergence to stationary distribution
P=np.array([[.7,.2,.1],[.3,.4,.3],[.2,.4,.4]]); names=["Sunny","Cloudy","Rainy"]; cols=[GOLD,"#b0b0d0",OUTC]
fig,(a1,a2)=plt.subplots(1,2,figsize=(11,4.6),dpi=110,facecolor=BG,gridspec_kw={"width_ratios":[1,1.2]})
for a in (a1,a2): a.set_facecolor(BG)
pos=np.array([[0,1],[-1,-.6],[1,-.6]])
for i in range(3):
    for j in range(3):
        if i==j: continue
        a1.add_patch(FancyArrowPatch(pos[i],pos[j],connectionstyle="arc3,rad=.25",arrowstyle="-|>",mutation_scale=16,color=cols[i],lw=1.6,shrinkA=34,shrinkB=34,alpha=.9))
        mid=(pos[i]+pos[j])/2; d=pos[j]-pos[i]; perp=np.array([d[1],-d[0]])/np.linalg.norm(d)
        a1.text(*(mid+perp*.3),f"{P[i,j]:.1f}",color=cols[i],ha="center",va="center",fontsize=10,weight="bold")
for i in range(3):
    a1.add_patch(Circle(pos[i],.36,color=BG,ec=cols[i],lw=3,zorder=3))
    a1.text(*pos[i],names[i],ha="center",va="center",color=cols[i],fontsize=10,weight="bold",zorder=4)
    a1.text(pos[i][0],pos[i][1]+(.48 if i==0 else -.55),f"stay {P[i,i]:.1f}",ha="center",color=cols[i],fontsize=9)
a1.set_xlim(-1.6,1.6); a1.set_ylim(-1.35,1.65); a1.set_aspect("equal"); a1.axis("off")
a1.set_title("The weather has no memory",color=TXT,fontsize=13,weight="bold")
for start in range(3):
    pi=np.eye(3)[start]; hist=[pi]
    for _ in range(14): pi=pi@P; hist.append(pi)
    hist=np.array(hist)
    for k in range(3): a2.plot(hist[:,k],color=cols[k],lw=2,alpha=.85,ls=["-","--",":"][start])
w,v=np.linalg.eig(P.T); st=np.real(v[:,np.argmax(np.real(w))]); st/=st.sum()
for k in range(3): a2.text(14.3,st[k],f"{names[k]} {st[k]:.0%}",color=cols[k],va="center",fontsize=10)
a2.set_xlim(0,18); a2.set_xlabel("day"); a2.set_ylabel("P(state)")
a2.set_title("Start anywhere, end up in the same place",color=TXT,fontsize=13,weight="bold")
for s in a2.spines.values(): s.set_color("#333355")
a2.grid(alpha=.15); fig.tight_layout(); fig.savefig(f"{OUT}/markov-weather.png",facecolor=BG); plt.close(fig)
print("stationary", st)

# --- PNG: DH paint mixing
def mix(*c):
    c=[np.array(matplotlib.colors.to_rgb(x)) for x in c]; return sum(c)/len(c)
Y="#ffd400"; R="#e63946"; B="#1d6fe0"
A=mix(Y,R); Bp=mix(Y,B); S=mix(Y,R,B)
fig,ax=plt.subplots(figsize=(11,5.2),dpi=110,facecolor=BG); ax.set_facecolor(BG); ax.axis("off")
ax.set_xlim(0,11); ax.set_ylim(0,5.4)
def blob(x,y,c,label,sub=""):
    ax.add_patch(Circle((x,y),.42,color=c,ec="white",lw=1.5,zorder=3)); ax.text(x,y-.68,label,ha="center",color=TXT,fontsize=10,weight="bold")
    if sub: ax.text(x,y-.95,sub,ha="center",color="#9090b0",fontsize=9)
def arr(a,b): ax.add_patch(FancyArrowPatch(a,b,arrowstyle="-|>",mutation_scale=14,color="#7070a0",lw=1.4,shrinkA=24,shrinkB=24))
ax.text(1.6,5.0,"ALICE",color=IN,fontsize=15,weight="bold",ha="center"); ax.text(9.4,5.0,"BOB",color=OUTC,fontsize=15,weight="bold",ha="center")
ax.text(5.5,5.0,"PUBLIC  (Eve sees all of this)",color=GOLD,fontsize=12,weight="bold",ha="center")
ax.add_patch(plt.Rectangle((3.6,1.0),3.8,3.7,fc="#1a1a33",ec=GOLD,ls="--",lw=1.2))
blob(5.5,3.85,Y,"common paint","g, p")
blob(.9,3.85,R,"Alice's secret","a"); blob(10.1,3.85,B,"Bob's secret","b")
blob(2.3,2.3,A,"Alice mixes","gᵃ mod p"); blob(8.7,2.3,Bp,"Bob mixes","gᵇ mod p")
arr((.9,3.85),(2.3,2.3)); arr((10.1,3.85),(8.7,2.3)); arr((5.5,3.85),(2.3,2.3)); arr((5.5,3.85),(8.7,2.3))
blob(4.5,2.3,A,"sent →"); blob(6.5,2.3,Bp,"← sent")
blob(1.6,.8,S,"shared secret","(gᵇ)ᵃ mod p"); blob(9.4,.8,S,"shared secret","(gᵃ)ᵇ mod p")
arr((6.5,2.3),(1.6,.8)); arr((4.5,2.3),(9.4,.8))
ax.text(5.5,.45,"mixing is easy · un-mixing is hopeless",ha="center",color=GOLD,fontsize=11,style="italic")
fig.tight_layout(); fig.savefig(f"{OUT}/diffie-hellman-paint.png",facecolor=BG); plt.close(fig)

# --- banner
fig=plt.figure(figsize=(12,3.2),dpi=110,facecolor=BG); ax=fig.add_axes([0,0,1,1]); ax.set_facecolor(BG); ax.axis("off")
q=rng.random((9000,2))*[12,3.2]; ax.scatter(q[:,0],q[:,1],s=rng.random(9000)*3,c=rng.choice([IN,OUTC,GOLD,"#9b5de5"],9000),alpha=.35,lw=0)
ax.set_xlim(0,12); ax.set_ylim(0,3.2)
ax.text(6,1.95,"MONTE CARLO",ha="center",va="center",fontsize=54,weight="bold",color="white")
ax.text(6,.95,"roll the dice · chain the states · share the secret",ha="center",fontsize=17,color=GOLD)
fig.savefig(f"{OUT}/banner.png",facecolor=BG); plt.close(fig)
print("done")
