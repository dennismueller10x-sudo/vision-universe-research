"""Independent Decimal split-vintage reconstruction; no JS imports."""
import decimal,json,math,sys
from pathlib import Path
D=decimal.Decimal
def price(rows):
 out=[None]*len(rows);factor=D(1)
 for i in range(len(rows)-1,-1,-1):
  out[i]=D(str(rows[i]['close']))/factor;factor*=D(str(rows[i]['splitFactor']))
 return out
def rounded(x):
 if x>=1:return float(x.quantize(D('.01'),rounding=decimal.ROUND_HALF_UP))
 return float(x.quantize(D(1).scaleb(x.adjusted()-3),rounding=decimal.ROUND_HALF_UP))
def main(file):
 x=json.loads(Path(file).read_text());raw=x['raw']['bars'];old=[b for b in raw if b['date']<=x['weekly']['asOf']];a=price(raw);b=price(old)
 assert len(a)==len(x['newPrices']) and len(b)==len(x['oldPrices'])
 for actual,want in zip(x['newPrices'],a):assert math.isclose(actual,float(want),rel_tol=1e-12,abs_tol=1e-12)
 for actual,want in zip(x['oldPrices'],b):assert math.isclose(actual,float(want),rel_tol=1e-12,abs_tol=1e-12)
 old_by={r['date']:v for r,v in zip(old,b)};new_by={r['date']:v for r,v in zip(raw,a)}
 for d,v in x['weekly']['points']:assert math.isclose(v,rounded(old_by[d]),rel_tol=1e-10,abs_tol=1e-12)
 for d,v in x['daily']['points']:assert math.isclose(v,rounded(new_by[d]),rel_tol=1e-10,abs_tol=1e-12)
 assert [r[0] for r in x['weekly']['points']]==[r[0] for r in x['revised']['points']]
 for d,v in x['revised']['points']:assert math.isclose(v,rounded(new_by[d]),rel_tol=1e-10,abs_tol=1e-12)
 assert any(r['date']>x['weekly']['asOf'] and r['splitFactor']!=1 for r in raw)
 print(json.dumps(dict(state='PASS',rawPrices=len(a),oldBasisPrices=len(b),oldWeeklyPoints=len(x['weekly']['points']),currentDailyPoints=len(x['daily']['points']),reconstructedWeeklyPoints=len(x['revised']['points']),method='Independent Python Decimal backwards cumulative provider split factors; observed dates only')))
if __name__=='__main__':main(sys.argv[1])
