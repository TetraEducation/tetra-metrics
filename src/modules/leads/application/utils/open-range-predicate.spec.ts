import { intersectsOpenRange } from './open-range-predicate';

describe('intersectsOpenRange', () => {
  describe('somente mínimo', () => {
    it('retorna true quando perfil_max atende filtro_min', () => {
      expect(intersectsOpenRange(20, 40, 30, undefined)).toBe(true);
    });

    it('retorna false quando perfil_max é menor que filtro_min', () => {
      expect(intersectsOpenRange(20, 25, 30, undefined)).toBe(false);
    });
  });

  describe('somente máximo', () => {
    it('retorna true quando perfil_min atende filtro_max', () => {
      expect(intersectsOpenRange(20, 40, undefined, 25)).toBe(true);
    });

    it('retorna false quando perfil_min é maior que filtro_max', () => {
      expect(intersectsOpenRange(30, 50, undefined, 25)).toBe(false);
    });
  });

  describe('ambos', () => {
    it('retorna true para intervalos que se intersectam', () => {
      expect(intersectsOpenRange(20, 40, 30, 45)).toBe(true);
    });

    it('retorna false para intervalos sem interseção', () => {
      expect(intersectsOpenRange(10, 20, 30, 40)).toBe(false);
    });
  });

  describe('intervalos abertos (NULL)', () => {
    it('trata perfil_max nulo como sem limite superior', () => {
      expect(intersectsOpenRange(20, null, 30, undefined)).toBe(true);
    });

    it('trata perfil_min nulo como sem limite inferior', () => {
      expect(intersectsOpenRange(null, 20, undefined, 10)).toBe(true);
    });

    it('trata perfil totalmente aberto como interseção', () => {
      expect(intersectsOpenRange(null, null, 30, 40)).toBe(true);
    });
  });

  describe('sem filtro', () => {
    it('retorna true quando min e max do filtro não são informados', () => {
      expect(intersectsOpenRange(10, 20, undefined, undefined)).toBe(true);
      expect(intersectsOpenRange(null, null, undefined, undefined)).toBe(true);
    });
  });

  describe('salário e idade', () => {
    it('aplica a mesma lógica para salário', () => {
      expect(intersectsOpenRange(3000, 7000, 5000, 9000)).toBe(true);
      expect(intersectsOpenRange(3000, 4000, 5000, 9000)).toBe(false);
    });

    it('aplica a mesma lógica para idade', () => {
      expect(intersectsOpenRange(25, 35, 30, 40)).toBe(true);
      expect(intersectsOpenRange(18, 24, 30, 40)).toBe(false);
    });
  });
});
