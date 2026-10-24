-- Initial Sitio/Purok labels from the SK VASRA reference screenshots.
-- Idempotent: existing names and residents are never changed.
-- The sole authorized chairman is recorded as directory owner.
insert into vasra.kk_sitios(name,sort_order,active,created_by)
select entry.name,entry.display_order,true,chair.id
from (values
 ('BAI Lower',10),('BAI Upper',20),('BPI Compound',30),
 ('Central VASRA',40),('DENR-NCR Compound',50),('Fisheries Street',60),
 ('Palanas A',70),('Palanas B',80),('Palanas C',90),('Palanas D',100)
) as entry(name,display_order)
cross join (select id from vasra.users where role='chairman' order by id limit 1) chair
on conflict (normalized_name) do nothing;
